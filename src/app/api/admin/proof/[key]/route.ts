import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin";
import { readProof, PROOF_MIME } from "@/commerce/proofs";

/**
 * The ONLY way to read a payment proof.
 *
 * Receipts are financial PII, so they live outside `public/` and are served from here
 * behind the owner session. `readProof` validates the key against an anchored
 * allow-list, so a crafted key cannot escape the proofs directory.
 *
 * Spec: requirements.md R12.2.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { key } = await params;
  const proof = readProof(decodeURIComponent(key));
  if (!proof) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  void req;
  return new NextResponse(new Uint8Array(proof.bytes), {
    headers: {
      "Content-Type": PROOF_MIME[proof.ext] ?? "application/octet-stream",
      // Never cached by a shared cache, and never indexed.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Disposition": "inline",
    },
  });
}
