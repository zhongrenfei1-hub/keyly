import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/(shop)/account-actions";
import { Container } from "@/components/brand";
import { currentUser } from "@/lib/guard";
import { listOrdersByEmail, type OrderStatus } from "@/lib/shop";
import { fmtTime, yuan } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata = { title: "我的" };

const STATUS: Record<OrderStatus, { label: string; tone: string }> = {
  pending: { label: "待付款", tone: "bg-warning-soft text-warning" },
  paid: { label: "待发货", tone: "bg-warning-soft text-warning" },
  delivered: { label: "已发货", tone: "bg-[#ecfdf3] text-[#15803d]" },
  expired: { label: "已关闭", tone: "bg-muted text-muted-foreground" },
  refunded: { label: "已退款", tone: "bg-muted text-muted-foreground" },
};

const LINKS = [
  { href: "/#store", hand: "The shelf", title: "继续逛" },
  { href: "/orders", hand: "Find it", title: "查订单" },
  { href: "/redeem", hand: "A code", title: "兑换" },
  { href: "/support", hand: "Need help", title: "售后" },
];

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const orders = listOrdersByEmail(user.email);
  const who = user.email.endsWith("@weixin") ? "微信登录" : user.email;

  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-12">
        <div>
          <p className="font-hand text-[34px] leading-none text-link sm:text-[40px]">Your account</p>
          <h1 className="mt-2 type-serif type-title sm:type-headline">我的。</h1>
          <p className="mt-3 type-body break-all text-muted-foreground">{who}</p>
          <p className="mt-2 type-small text-muted-foreground">
            下单时填这个邮箱，订单会出现在右边。
          </p>
          <ul className="mt-6 grid grid-cols-2 gap-3">
            {LINKS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="card-solid card-lift block p-4">
                  <span className="block font-hand text-[22px] leading-none text-link">{item.hand}</span>
                  <span className="mt-1 block type-small font-semibold">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
          <form action={logout} className="mt-6">
            <button type="submit" className="type-small text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              退出登录
            </button>
          </form>
        </div>

        <section className="card-solid p-5 sm:p-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="type-lead font-semibold">订单</h2>
            <p className="font-hand text-[26px] leading-none text-link">{orders.length}</p>
          </div>
          {orders.length === 0 ? (
            <p className="mt-4 type-body text-muted-foreground">
              还没有订单。
              <Link href="/#store" className="ml-1 text-link hover:underline">
                去看看货架
              </Link>
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-black/6">
              {orders.map((o) => {
                const status = STATUS[o.status];
                return (
                  <li key={o.no}>
                    <Link href={`/order/${o.no}`} className="flex items-center justify-between gap-4 py-4">
                      <span className="min-w-0">
                        <span className="block truncate type-body font-semibold">{o.product_name}</span>
                        <span className="mt-1 block font-mono type-caption text-muted-foreground">
                          {o.no} · {fmtTime(o.created_at)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block type-small font-semibold tabular-nums">
                          {o.channel === "redeem" ? "兑换" : yuan(o.amount_cents)}
                        </span>
                        <span className={cn("mt-1 inline-flex rounded-full px-2.5 py-0.5 type-caption", status.tone)}>
                          {status.label}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
