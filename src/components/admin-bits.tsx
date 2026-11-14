// 后台页面共用的小零件
import Link from "next/link";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "@/lib/site";
import type { OrderStatus } from "@/lib/shop";

export function PageTitle({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

export function Panel({
  title,
  aside,
  className,
  children,
}: {
  title?: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5", className)}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-medium">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

const TONE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-sky-100 text-sky-800",
  delivered: "bg-emerald-100 text-emerald-800",
  expired: "bg-muted text-muted-foreground",
  refunded: "bg-rose-100 text-rose-800",
};

export function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: OrderStatus }) {
  return <Pill className={TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

/** 筛选用的一排链接（订单状态、兑换码所属商品） */
export function FilterTabs({
  tabs,
  current,
}: {
  tabs: { href: string; label: string; key: string }[];
  current: string;
}) {
  return (
    <nav className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "true" : undefined}
          className={cn(
            "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
            t.key === current
              ? "border-transparent bg-foreground text-background"
              : "bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** 收支页和对账页共用的「上一周 / 下一周」。next 不传表示已经是本周，不能再往后翻。 */
export function WeekNav({
  label,
  prev,
  next,
  current,
}: {
  label: string;
  prev: string;
  next?: string;
  current: string;
}) {
  const link =
    "shrink-0 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      <Link href={prev} className={link}>
        上一周
      </Link>
      <span className="px-1.5 text-sm font-medium tabular-nums">{label}</span>
      {next && (
        <>
          <Link href={next} className={link}>
            下一周
          </Link>
          <Link href={current} className={link}>
            回到本周
          </Link>
        </>
      )}
    </nav>
  );
}
