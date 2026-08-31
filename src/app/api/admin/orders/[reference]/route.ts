import { NextRequest, NextResponse } from "next/server";
import { seeOther } from "@/lib/redirect";
import { isAdminRequest } from "@/lib/admin";
import { markVerified, setStatus, OrderError } from "@/commerce/orders";
import { isReferenceCode } from "@/commerce/reference";

/**
 * Owner actions on an order. Form POSTs, so the queue works without JavaScript.
 *
 * Deliberately NOT a general "set any status" endpoint: the allowed actions are named,
 * and the ledger enforces which transitions are legal on top of that. Two layers,
 * because this is the surface that grants people access.
 *
 * `verify` and `activate` are separate actions because they are separate acts —
 * confirming money arrived, and granting access. Collapsing them would hide which one
 * failed, and would let a mis-click do both.
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ reference: string }> },
) {
  // Fails closed: no valid owner session, no action, and a 404 rather than a 403 so
  // the endpoint's existence is not confirmed to an unauthenticated caller.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { reference } = await params;
  if (!isReferenceCode(reference)) {
    return NextResponse.json({ error: "invalid_reference" }, { status: 400 });
  }

  const form = await req.formData();
  const action = form.get("action");
  const locale = form.get("locale") === "ar" ? "ar" : "en";
  const back = (code?: string) =>
    seeOther(`/${locale}/admin/orders${code ? `?e=${code}` : "?ok=1"}`);

  try {
    switch (action) {
      case "verify":
        // "owner" rather than a name: this is a single-operator tool today. When it
        // is not, this becomes the authenticated identity.
        markVerified(reference, "owner");
        break;
      case "activate":
        setStatus(reference, "active");
        break;
      case "cancel":
        setStatus(reference, "cancelled");
        break;
      case "refund":
        setStatus(reference, "refunded");
        break;
      default:
        return back("unknown_action");
    }
  } catch (err) {
    if (err instanceof OrderError) {
      // An illegal transition is a real answer, not a crash — surface it.
      return back(err.code === "conflict" ? "illegal_transition" : "invalid");
    }
    console.error("[admin] action failed:", err);
    return back("failed");
  }

  return back();
}
