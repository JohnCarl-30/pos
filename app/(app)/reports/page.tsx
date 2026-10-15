import type { Metadata } from "next";
import type { ReactNode } from "react";
import PageHeader from "@/components/_common/page-header";
import EmptyState from "@/components/_common/empty-state";
import Button, { buttonVariants } from "@/components/_ui/button";
import { ScrollArea } from "@/components/_ui/scroll-area";
import ReportsToolbar from "@/components/reports/reports-toolbar";
import SummaryView from "@/components/reports/summary-view";
import ProductsView from "@/components/reports/products-view";
import StaffView from "@/components/reports/staff-view";
import CashupsView from "@/components/reports/cashups-view";
import { getCurrentStore, requireRole } from "@/lib/auth/staff";
import { createClient } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { pageOf } from "@/lib/customers/list";
import { resolveRange } from "@/lib/reports/range";
import { exportHref, parseOnlyOff, parseProductSort, parseReportTab, reportHref } from "@/lib/reports/params";
import { categoryShares, sortProducts } from "@/lib/reports/shape";
import { loadCashups, loadProducts, loadStaff, loadSummary, loadTrend } from "@/lib/reports/queries";

export const metadata: Metadata = { title: "Reports" };

const PAGE_SIZE = 50;

type ReportsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const staff = await requireRole("manager");
  const store = await getCurrentStore(staff);
  if (!store) {
    return (
      <section id="reports" className="flex min-h-0 min-w-0 flex-1 flex-col">
        <PageHeader title="Reports" />
        <EmptyState title="No store yet" description="Ask an owner to add you to a store." />
      </section>
    );
  }

  const params = await searchParams;
  const supabase = await createClient();
  const { data: storeRow } = await supabase.from("stores").select("timezone").eq("id", store.id).maybeSingle();
  const timeZone = storeRow?.timezone ?? "UTC";
  const { range, error } = resolveRange(params, timeZone, new Date());
  const tab = parseReportTab(params);
  const money = (minor: number) => formatMoney(minor, store.currency, "en-US");
  const today = resolveRange({}, timeZone, new Date()).range;

  let content: ReactNode;
  if (error) {
    content = <EmptyState title="Can't show that range" description={error} action={<Button href={reportHref(tab, today)} variant="secondary" size="md">Show today</Button>} />;
  } else if (tab === "summary") {
    const [summary, trend] = await Promise.all([loadSummary(supabase, store.id, range), loadTrend(supabase, store.id, range)]);
    content =
      summary.sales_count === 0 && summary.refund_count === 0 && summary.void_count === 0 ? (
        <EmptyState
          title="No sales in this range"
          description="Sales, refunds and voids from the register show up here."
          action={range.preset === "today" ? undefined : <Button href={reportHref(tab, today)} variant="secondary" size="md">Show today</Button>}
        />
      ) : (
        <SummaryView summary={summary} trend={trend} range={range} money={money} />
      );
  } else if (tab === "products") {
    const sort = parseProductSort(params);
    const rows = sortProducts(await loadProducts(supabase, store.id, range), sort);
    const requested = Number.parseInt(String(params.page ?? "1"), 10);
    const paged = pageOf(rows, Number.isFinite(requested) && requested > 0 ? requested : 1, PAGE_SIZE);
    content =
      rows.length === 0 ? (
        <EmptyState title="Nothing sold in this range" description="Try a longer range." />
      ) : (
        <ProductsView
          rows={paged.rows}
          categories={categoryShares(rows)}
          sort={sort}
          page={paged.page}
          pages={paged.pages}
          total={paged.total}
          money={money}
          sortHref={(value) => reportHref("products", range, { sort: value })}
          hrefFor={(page) => reportHref("products", range, { sort, page: String(page) })}
        />
      );
  } else if (tab === "staff") {
    const rows = await loadStaff(supabase, store.id, range);
    content = rows.length === 0 ? <EmptyState title="No staff activity in this range" description="Try a longer range." /> : <StaffView rows={rows} range={range} money={money} />;
  } else {
    const onlyOff = parseOnlyOff(params);
    const rows = (await loadCashups(supabase, store.id, range)).filter((row) => !onlyOff || row.difference !== 0);
    content = (
      <CashupsView
        rows={rows}
        onlyOff={onlyOff}
        toggleHref={reportHref("cashups", range, onlyOff ? {} : { only: "off" })}
        timeZone={timeZone}
        money={money}
      />
    );
  }

  return (
    <section id="reports" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PageHeader
        title={`Reports · ${store.name}`}
        actions={
          <a href={exportHref(tab, range)} className={buttonVariants({ variant: "secondary", size: "md" })}>
            Export CSV
          </a>
        }
      />
      <ReportsToolbar tab={tab} preset={range.preset} fromDate={range.fromDate} toDate={range.toDate} />
      <ScrollArea className="min-h-0 flex-1">{content}</ScrollArea>
    </section>
  );
}
