import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getCheckout } from "@/i18n/checkout";
import { isAdminRequest, adminTokenConfigured } from "@/lib/admin";
import {
  listOrders,
  countByStatus,
  allowedNext,
  amountForDisplay,
  type Order,
  type OrderStatus,
} from "@/commerce/orders";
import { RAILS } from "@/commerce/rails";
import { getTier } from "@/commerce/pricing";
import { Amount } from "@/components/Price";
import { Ltr } from "@/components/Ltr";
import { Button, Card, Display, Divider, Eyebrow, Lead, Section } from "@/components/ui";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

/** Reads the ledger and a session cookie on every request. Never prerender. */
export const dynamic = "force-dynamic";

/**
 * The owner's order queue.
 *
 * Lives under `[locale]` because `app/[locale]/layout.tsx` owns `<html>` and `<body>`
 * and this app has no root layout — a page outside the segment would render without a
 * document shell.
 *
 * WHY THIS PAGE DOES NOT GRANT ACCESS ITSELF
 * ------------------------------------------
 * Verifying a payment happens here. Provisioning does not. Access lives in two other
 * systems — the bot's `members` table and the portal's `availableStages` — in two other
 * repositories, and this service has no connection to either. Writing into a student
 * database from a third service, without ever having read that database live, is how
 * you corrupt the one dataset that cannot be reconstructed. So the queue prints the
 * two steps and the operator does them. A manual step that is visible beats an
 * automated one that is wrong.
 *
 * Spec: requirements.md R12.6.
 */
export default async function AdminOrders({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getCheckout(locale as Locale);
  const a = dict.admin;

  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const error = one("e");

  // Fails closed. `isAdminRequest` returns false when ADMIN_TOKEN is unset, so an
  // unconfigured server locks everyone out rather than letting everyone in.
  if (!(await isAdminRequest())) {
    return (
      <main>
        <Section className="pt-14 pb-16">
          <Eyebrow>{a.title}</Eyebrow>
          <Display as="h1">{a.signInTitle}</Display>
          <Lead className="mt-5 max-w-md">{a.signInIntro}</Lead>

          {error ? (
            <Card className="mt-8 max-w-md border-(--color-bronze)">
              <p className="text-(--color-parchment)">
                {(a.errors as Record<string, string>)[error] ?? a.errors.generic}
              </p>
            </Card>
          ) : null}

          {!adminTokenConfigured() ? (
            <Card className="mt-8 max-w-md border-(--color-bronze)">
              <p className="text-(--color-parchment)">{a.errors.unconfigured}</p>
            </Card>
          ) : (
            <form
              method="post"
              action="/api/admin/session"
              className="mt-8 max-w-md space-y-4"
            >
              <input type="hidden" name="locale" value={locale} />
              <label className="block">
                <span className="mb-1.5 block text-sm text-(--color-parchment)">
                  {a.tokenLabel}
                </span>
                <input
                  type="password"
                  name="token"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-sm border border-(--color-gold)/25 bg-(--color-surface) px-4 py-3 text-start text-(--color-parchment) outline-none focus:border-(--color-gold)"
                />
              </label>
              <Button type="submit">{a.signIn}</Button>
            </form>
          )}
        </Section>
      </main>
    );
  }

  const filter = one("status") as OrderStatus | undefined;
  const counts = countByStatus();
  const orders = listOrders(filter ? { status: filter, limit: 200 } : { limit: 200 });

  const STATUSES: OrderStatus[] = [
    "created",
    "proof_submitted",
    "verified",
    "active",
    "cancelled",
    "refunded",
  ];

  return (
    <main>
      <Section className="pt-14 pb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Eyebrow>{a.countsLegend}</Eyebrow>
            <Display as="h1">{a.title}</Display>
          </div>
          <form method="post" action="/api/admin/session">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="action" value="signout" />
            <Button type="submit" variant="quiet" className="text-xs">
              {a.signOut}
            </Button>
          </form>
        </div>

        {/* Counts double as the filter. Money waiting on a human is the first thing
            the operator should see, and it is also the thing they click. */}
        <div className="mt-6 flex flex-wrap gap-2">
          <FilterChip href={`/${locale}/admin/orders`} active={!filter}>
            {`${Object.values(counts).reduce((n, v) => n + v, 0)}`}
          </FilterChip>
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              href={`/${locale}/admin/orders?status=${s}`}
              active={filter === s}
            >
              {dict.confirm.status[s]} <Ltr>{String(counts[s] ?? 0)}</Ltr>
            </FilterChip>
          ))}
        </div>

        {error ? (
          <Card className="mt-6 max-w-xl border-(--color-bronze)">
            <p className="text-(--color-parchment)">
              {(a.errors as Record<string, string>)[error] ?? a.errors.generic}
            </p>
          </Card>
        ) : null}
        {one("ok") === "1" ? (
          <Card className="mt-6 max-w-xl border-(--color-gold)">
            <p className="text-(--color-parchment)">{a.ok}</p>
          </Card>
        ) : null}
      </Section>

      <Divider />

      <Section className="pt-8 pb-16">
        {orders.length === 0 ? (
          <p className="text-(--color-text-muted)">{a.empty}</p>
        ) : (
          // A stacked list, not a table. The operator reviews these on a phone, and a
          // seven-column table in an RTL document is unreadable there.
          <div className="grid gap-4 lg:grid-cols-2">
            {orders.map((order) => (
              <OrderRow key={order.referenceCode} order={order} locale={locale} dict={dict} />
            ))}
          </div>
        )}
      </Section>
    </main>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={
        "rounded-full border px-3 py-1 text-xs tracking-wide transition-colors " +
        (active
          ? "border-(--color-gold) bg-(--color-gold)/15 text-(--color-gold)"
          : "border-(--color-gold)/25 text-(--color-text-muted) hover:border-(--color-gold)/50")
      }
    >
      {children}
    </a>
  );
}

function OrderRow({
  order,
  locale,
  dict,
}: {
  order: Order;
  locale: string;
  dict: ReturnType<typeof getCheckout>;
}) {
  const a = dict.admin;
  const next = allowedNext(order.status);
  const railDef = RAILS.find((r) => r.id === order.rail);
  const railLabel =
    (railDef && (dict.join.rails as Record<string, string>)[railDef.labelKey]) ?? order.rail;

  /**
   * Only actions the ledger would accept. The ledger rejects the rest anyway; this
   * stops the operator from being offered a button that produces an error toast.
   */
  const actions: Array<{ action: string; label: string; variant: "primary" | "secondary" }> = [];
  if (next.includes("verified")) {
    actions.push({ action: "verify", label: a.actions.verify, variant: "primary" });
  }
  if (next.includes("active")) {
    actions.push({ action: "activate", label: a.actions.activate, variant: "primary" });
  }
  if (next.includes("refunded")) {
    actions.push({ action: "refund", label: a.actions.refund, variant: "secondary" });
  }
  if (next.includes("cancelled")) {
    actions.push({ action: "cancel", label: a.actions.cancel, variant: "secondary" });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-(--color-gold) select-all">
          <Ltr>{order.referenceCode}</Ltr>
        </span>
        <span className="text-xs text-(--color-text-muted)">
          {/* SQLite's own `datetime('now')` string, sliced. Deliberately not
              toLocaleString: an Arabic locale would render Arabic-Indic digits, and
              this column is scanned against a bank SMS written in Western ones. */}
          <Ltr>{order.createdAt.slice(0, 16)}</Ltr>
        </span>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <Fact label={a.columns.buyer}>{order.name}</Fact>
        <Fact label={a.contactLabel}>
          <Ltr>{order.contact}</Ltr>
        </Fact>
        <Fact label={a.columns.plan}>
          <span className="font-(family-name:--font-display-ar)">
            {getTier(order.tier).nameAr}
          </span>{" "}
          ·{" "}
          {order.term === "annual" ? dict.join.termAnnual : dict.join.termMonthly}
        </Fact>
        <Fact label={a.columns.amount}>
          <span className="text-(--color-gold)">
            <Amount value={amountForDisplay(order)} currency={order.currency} />
          </span>
        </Fact>
        <Fact label={a.columns.rail}>
          <Ltr>{railLabel}</Ltr>
        </Fact>
        <Fact label={a.columns.status}>{dict.confirm.status[order.status]}</Fact>
        {order.verifiedBy ? (
          <Fact label={a.verifiedBy}>
            <Ltr>{order.verifiedBy}</Ltr>
          </Fact>
        ) : null}
        <Fact label={a.columns.proof}>
          {order.proofKey ? (
            <a
              href={`/api/admin/proof/${encodeURIComponent(order.proofKey)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-(--color-gold) underline decoration-(--color-gold)/40 hover:decoration-(--color-gold)"
            >
              {a.proofView}
            </a>
          ) : (
            <span className="text-(--color-text-muted)">{a.noProof}</span>
          )}
        </Fact>
      </dl>

      {/* The two manual provisioning steps, shown exactly when they are due. */}
      {order.status === "verified" ? (
        <div className="mt-5 rounded-sm border border-(--color-gold)/20 bg-(--color-obsidian)/40 p-4">
          <p className="mb-2 text-sm text-(--color-gold)">{a.provisionLegend}</p>
          <ol className="space-y-2 text-sm text-(--color-parchment)">
            <li>
              {a.provisionDiscord}
              <br />
              <Ltr className="text-xs text-(--color-text-muted)">members.suspended_at</Ltr>
            </li>
            <li>
              {a.provisionPortal}
              <br />
              <Ltr className="text-xs text-(--color-text-muted)">User.availableStages</Ltr>
            </li>
          </ol>
          <p className="mt-3 text-xs text-(--color-text-muted)">{a.provisionNote}</p>
        </div>
      ) : null}

      {actions.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.map((act) => (
            <form
              key={act.action}
              method="post"
              action={`/api/admin/orders/${order.referenceCode}`}
            >
              <input type="hidden" name="locale" value={locale} />
              <input type="hidden" name="action" value={act.action} />
              <Button type="submit" variant={act.variant} className="text-xs">
                {act.label}
              </Button>
            </form>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-(--color-text-muted)">{label}</dt>
      <dd className="text-end break-all text-(--color-parchment)">{children}</dd>
    </div>
  );
}
