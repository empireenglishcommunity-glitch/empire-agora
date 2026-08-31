import { NextRequest, NextResponse } from "next/server";
import { seeOther } from "@/lib/redirect";
import { attachProof, findByReference, OrderError } from "@/commerce/orders";
import { storeProof, MAX_PROOF_BYTES } from "@/commerce/proofs";
import { isReferenceCode } from "@/commerce/reference";
import { locales } from "@/i18n/config";

/**
 * POST /api/orders/<reference>/proof — attach a payment receipt.
 *
 * `multipart/form-data` from a plain `<input type="file">`, so it works without
 * JavaScript. On a phone that input opens the camera roll directly, which is the
 * one-tap requirement (R5.5).
 *
 * The image is validated by MAGIC BYTES and stored outside `public/`. See
 * `commerce/proofs.ts` for why both of those matter.
 */

export const runtime = "nodejs";

const MAX_ATTEMPTS = 20;
const WINDOW_MS = 10 * 60_000;
const attempts = new Map<string, { n: number; resetAt: number }>();

function clientKey(req: NextRequest): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  const { reference } = await params;
    // Rate-limited because this endpoint writes files.
  const key = clientKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { n: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.n += 1;
    if (entry.n > MAX_ATTEMPTS) {
      return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
    }
  }

  // Shape-check before touching the database.
  if (!isReferenceCode(reference)) {
    return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
  }

  const order = findByReference(reference);
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const localeRaw = form.get("locale");
  const locale =
    typeof localeRaw === "string" && (locales as readonly string[]).includes(localeRaw)
      ? localeRaw
      : order.locale === "en"
        ? "en"
        : "ar";
  const backTo = (code?: string) =>
    seeOther(`/${locale}/join/${reference}${code ? `?e=${code}` : "?uploaded=1"}`);

  const file = form.get("proof");
  if (!(file instanceof File) || file.size === 0) {
    return backTo("nofile");
  }
  // Reject on the declared size before buffering, so an oversized upload does not
  // have to be read into a 384 MB container to be refused.
  if (file.size > MAX_PROOF_BYTES) {
    return backTo("toolarge");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = storeProof(reference, bytes);
  if (!stored.ok) {
    // `bad_reference` is unreachable from here — the reference was validated above and
    // the order was found — so it is treated as a server fault rather than being
    // reported to the buyer as a bad image, which would send them re-screenshotting
    // something that was never the problem.
    switch (stored.reason) {
      case "too_large":
        return backTo("toolarge");
      case "empty":
      case "unsupported_type":
        return backTo("badtype");
      default:
        console.error(`[orders] storeProof rejected "${reference}": ${stored.reason}`);
        return backTo("storage");
    }
  }

  try {
    attachProof(reference, stored.key);
  } catch (err) {
    if (err instanceof OrderError && err.code === "conflict") {
      // Already verified or cancelled — the file is on disk but the order has moved
      // on. Not an error worth alarming the buyer about.
      return backTo("already");
    }
    console.error("[orders] failed to attach proof:", err);
    return backTo("storage");
  }

  return backTo();
}
