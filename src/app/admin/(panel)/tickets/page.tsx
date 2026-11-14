import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { toggleTicket } from "@/app/admin/actions";
import { ActionForm } from "@/components/action-form";
import { Empty, PageTitle, Pill } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { fmtTime } from "@/lib/site";

export const metadata = { title: "工单" };

export default function Page() {
  return (
    <>
      <PageTitle title="工单" desc="买家在「售后」页提交的问题。处理完按邮箱回复对方，再点「标记已处理」。" />
      <Suspense fallback={<Skeleton className="h-72" />}>
        <Tickets />
      </Suspense>
    </>
  );
}

type Ticket = {
  id: number;
  order_no: string;
  email: string;
  content: string;
  status: "open" | "closed";
  created_at: number;
  /** 买家填的订单号在系统里确实存在 */
  known: number;
};

async function Tickets() {
  await requireAdmin();
  await io();
  // ponytail: 只列最近 200 条，没处理的排前面
  const tickets = all<Ticket>(
    `SELECT t.*, EXISTS (SELECT 1 FROM orders o WHERE o.no = t.order_no) AS known
     FROM tickets t ORDER BY t.status = 'closed', t.id DESC LIMIT 200`,
  );
  if (tickets.length === 0) return <Empty>还没有工单。</Empty>;

  return (
    <ul className="space-y-3">
      {tickets.map((t) => (
        <li key={t.id} className="rounded-2xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {t.status === "open" ? (
              <Pill className="bg-amber-100 text-amber-800">待处理</Pill>
            ) : (
              <Pill className="bg-muted text-muted-foreground">已处理</Pill>
            )}
            <a href={`mailto:${t.email}`} className="font-medium hover:text-link">
              {t.email}
            </a>
            {t.order_no &&
              (t.known ? (
                <Link
                  href={`/admin/orders/${t.order_no}`}
                  className="font-mono text-xs text-link hover:underline"
                >
                  {t.order_no}
                </Link>
              ) : (
                <span className="font-mono text-xs text-muted-foreground">
                  {t.order_no}（不是本站的订单号）
                </span>
              ))}
            <span className="ml-auto text-muted-foreground tabular-nums">
              {fmtTime(t.created_at)}
            </span>
          </div>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{t.content}</p>
          <ActionForm
            action={toggleTicket}
            submit={t.status === "open" ? "标记已处理" : "重新打开"}
            variant="outline"
            size="sm"
            className="mt-4 space-y-0"
          >
            <input type="hidden" name="id" value={t.id} />
          </ActionForm>
        </li>
      ))}
    </ul>
  );
}
