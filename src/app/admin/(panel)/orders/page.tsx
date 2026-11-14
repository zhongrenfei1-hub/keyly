import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { Empty, FilterTabs, PageTitle, Panel, StatusPill } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { sweepExpired, type Order } from "@/lib/shop";
import { fmtTime, STATUS_LABEL, yuan } from "@/lib/site";

export const metadata = { title: "订单" };

export default function Page({ searchParams }: PageProps<"/admin/orders">) {
  return (
    <>
      <PageTitle title="订单" />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: Pick<PageProps<"/admin/orders">, "searchParams">) {
  await requireAdmin();
  const sp = await searchParams;
  await io();
  sweepExpired();

  const status = typeof sp.status === "string" && sp.status in STATUS_LABEL ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 120) : "";

  const where: string[] = [];
  const args: string[] = [];
  if (status) {
    where.push("status = ?");
    args.push(status);
  }
  if (q) {
    where.push("(no LIKE ? OR email LIKE ?)");
    args.push(`%${q}%`, `%${q}%`);
  }
  // ponytail: 只取最近 200 笔；订单多了再加翻页
  const orders = all<Order>(
    `SELECT * FROM orders ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT 200`,
    ...args,
  );

  const href = (s: string) => {
    const p = new URLSearchParams();
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    const qs = p.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          current={status}
          tabs={[
            { key: "", label: "全部", href: href("") },
            ...Object.entries(STATUS_LABEL).map(([key, label]) => ({ key, label, href: href(key) })),
          ]}
        />
        <form action="/admin/orders" className="flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <Input
            name="q"
            defaultValue={q}
            placeholder="订单号或邮箱"
            aria-label="搜索订单"
            className="h-9 w-56 bg-card"
          />
          <Button type="submit" variant="outline" size="lg">
            搜索
          </Button>
        </form>
      </div>

      {orders.length === 0 ? (
        <Empty>没有符合条件的订单。</Empty>
      ) : (
        <Panel className="p-2 sm:p-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>订单号</TableHead>
                <TableHead>商品</TableHead>
                <TableHead className="text-right">金额</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">下单时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      href={`/admin/orders/${o.no}`}
                      className="font-mono text-xs hover:text-link"
                    >
                      {o.no}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 truncate">
                    {o.product_name} × {o.quantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.channel === "redeem" ? "兑换" : yuan(o.amount_cents)}
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{o.email}</TableCell>
                  <TableCell>
                    <StatusPill status={o.status} />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {fmtTime(o.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
