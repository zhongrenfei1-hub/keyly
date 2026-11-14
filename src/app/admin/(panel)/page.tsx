import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Empty, PageTitle, Panel } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { RevenueTrend } from "@/components/revenue-trend";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { all, get } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { listProducts, outOfStock, sweepExpired } from "@/lib/shop";
import { yuan } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata = { title: "概览" };

const DAY = 86_400_000;
const TZ = 8 * 3_600_000; // 按北京时间切天
// 算收入只看真付了钱的订单：已付款或已发货，不含兑换码取货，不含已退款
const PAID = `status IN ('paid', 'delivered') AND channel <> 'redeem'`;

export default function Page() {
  return (
    <>
      <PageTitle
        title="概览"
        desc="收入按北京时间统计，只算在本站付款的订单，不含兑换码取货和已退款的订单。在合作平台收到的钱记在「收支」里，只进每周对账，不在这一页。"
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Dashboard />
      </Suspense>
    </>
  );
}

const monthAgo = () => Date.now() - 30 * DAY;

/** 北京时间今天 0 点的时间戳 */
const todayStart = () => Math.floor((Date.now() + TZ) / DAY) * DAY - TZ;

async function Dashboard() {
  await requireAdmin();
  await io();
  sweepExpired();

  const today0 = todayStart();
  const sum = (since: number) =>
    get<{ orders: number; revenue: number; units: number }>(
      `SELECT COUNT(*) AS orders, COALESCE(SUM(amount_cents), 0) AS revenue, COALESCE(SUM(quantity), 0) AS units
       FROM orders WHERE ${PAID} AND paid_at >= ?`,
      since,
    )!;
  const today = sum(today0);
  const week = sum(today0 - 6 * DAY);
  const total = sum(0);

  const byDay = new Map(
    all<{ d: number; revenue: number; orders: number }>(
      `SELECT (paid_at + ${TZ}) / ${DAY} AS d, SUM(amount_cents) AS revenue, COUNT(*) AS orders
       FROM orders WHERE ${PAID} AND paid_at >= ? GROUP BY d`,
      today0 - 13 * DAY,
    ).map((r) => [r.d, r]),
  );
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = today0 - (13 - i) * DAY;
    const row = byDay.get((start + TZ) / DAY);
    return {
      day: new Date(start + TZ).toISOString().slice(5, 10),
      revenue: row?.revenue ?? 0,
      orders: row?.orders ?? 0,
    };
  });

  const count = (sql: string, ...params: number[]) => get<{ n: number }>(sql, ...params)!.n;
  // 近 30 天退款加换号超过两成的商品。
  // 口径：只看上架中的商品；订单是近 30 天内付款的订单（含兑换码取货）；
  // 其中已退款的、或者有卡密被换过的算「出问题」，又退又换的只算一笔。
  // 出问题的订单数超过订单数的两成（乘 5 比大小，避开小数）就计入。
  // 近 30 天没有订单的商品不在分组里，自然不算。
  const risky = all<{ id: number; name: string }>(
    `SELECT p.id, p.name FROM orders o JOIN products p ON p.id = o.product_id
     WHERE p.active = 1 AND o.paid_at >= ?
     GROUP BY p.id
     HAVING 5 * SUM(o.status = 'refunded' OR EXISTS
       (SELECT 1 FROM cards c WHERE c.order_id = o.id AND c.replaced_at IS NOT NULL)) > COUNT(*)
     ORDER BY p.id`,
    monthAgo(),
  );
  const todos = [
    {
      label: "已付款，等补货的订单",
      n: count(`SELECT COUNT(*) AS n FROM orders WHERE status = 'paid'`),
      href: "/admin/orders?status=paid",
    },
    {
      label: "没处理的工单",
      n: count(`SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'`),
      href: "/admin/tickets",
    },
    {
      // 什么算没货见 outOfStock：站外付款的商品没有卡密一般不算，名下还有没用掉的兑换码时才算。
      // 商品列表里标红的也是这一条规则，两边数的是同一批。
      label: "上架中但没货的商品",
      n: listProducts().filter(outOfStock).length,
      href: "/admin/products",
    },
    {
      // 直接写出是哪几件，点进去是第一件的编辑页，可以在那里下架。
      label:
        "近 30 天退款加换号超过两成的商品" +
        (risky.length ? `：${risky.map((p) => p.name).join("、")}` : ""),
      n: risky.length,
      href: risky.length ? `/admin/products/${risky[0].id}` : "/admin/products",
    },
  ];

  const top = all<{ name: string; units: number; revenue: number }>(
    `SELECT product_name AS name, SUM(quantity) AS units, SUM(amount_cents) AS revenue
     FROM orders WHERE ${PAID} GROUP BY product_id ORDER BY revenue DESC LIMIT 10`,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="今日收入" value={yuan(today.revenue)} note={`${today.orders} 笔订单`} />
        <Tile label="近 7 天收入" value={yuan(week.revenue)} note={`${week.orders} 笔订单`} />
        <Tile label="累计收入" value={yuan(total.revenue)} note={`${total.orders} 笔订单`} />
        <Tile label="累计销量" value={`${total.units} 件`} note="已付款的件数" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {todos.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className={cn(
              "flex items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-sm transition-colors hover:border-primary",
              t.n > 0 && "border-amber-300 bg-amber-50",
            )}
          >
            <span
              className={cn(
                "text-lg font-semibold",
                t.n > 0 ? "text-amber-800" : "text-muted-foreground",
              )}
            >
              {t.n}
            </span>
            <span className="flex-1">{t.label}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>

      <Panel>
        <RevenueTrend days={days} />
        <details className="mt-4 border-t pt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            每天的数字
          </summary>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead className="text-right">订单</TableHead>
                <TableHead className="text-right">收入</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...days].reverse().map((d) => (
                <TableRow key={d.day}>
                  <TableCell>{d.day}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.orders}</TableCell>
                  <TableCell className="text-right tabular-nums">{yuan(d.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </details>
      </Panel>

      <Panel title="各商品销售">
        {top.length === 0 ? (
          <Empty>还没有成交的订单。</Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>商品</TableHead>
                <TableHead className="text-right">销量</TableHead>
                <TableHead className="text-right">收入</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top.map((t) => (
                <TableRow key={t.name}>
                  <TableCell className="max-w-64 truncate">{t.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.units}</TableCell>
                  <TableCell className="text-right tabular-nums">{yuan(t.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
