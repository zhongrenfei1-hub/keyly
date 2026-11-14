import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { mockPay } from "@/app/(shop)/actions";
import { Container, Skeleton } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getProvider } from "@/lib/payment";
import { getOrder, sweepExpired } from "@/lib/shop";
import { fmtTime, yuan } from "@/lib/site";

export const metadata = { title: "模拟收银台" };

export default function Page({ params }: PageProps<"/pay/mock/[no]">) {
  return (
    <Container className="max-w-[480px] py-10 sm:py-16">
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Checkout params={params} />
      </Suspense>
    </Container>
  );
}

async function Checkout({ params }: Pick<PageProps<"/pay/mock/[no]">, "params">) {
  const { no } = await params;
  await io();
  if (!getProvider("mock")) notFound();
  sweepExpired();
  const order = getOrder(no);
  if (!order) notFound();
  if (order.status !== "pending") redirect(`/order/${order.no}`);

  return (
    <div className="card-solid p-6 sm:p-9">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2.5 py-1 type-caption font-semibold text-warning">
        <FlaskConical className="size-3.5" />
        测试环境，不会真的扣款
      </span>
      <h1 className="mt-4 type-title">模拟收银台</h1>
      <p className="mt-1 type-small text-muted-foreground">
        这里代替真实的支付页面。点「确认支付」等于付款成功。
      </p>

      <dl className="mt-7 divide-y divide-input border-y border-input type-small">
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">商品</dt>
          <dd className="text-right">
            {order.product_name} × {order.quantity}
          </dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">订单号</dt>
          <dd className="font-mono">{order.no}</dd>
        </div>
        <div className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">付款截止</dt>
          <dd className="tabular-nums">{fmtTime(order.expires_at)}</dd>
        </div>
      </dl>

      <p className="mt-7 text-center type-headline tabular-nums">
        {yuan(order.amount_cents)}
      </p>

      <form action={mockPay} className="mt-7">
        <input type="hidden" name="no" value={order.no} />
        <Button type="submit" variant="brand" size="xl" className="w-full">
          确认支付
        </Button>
      </form>
      <Link
        href={`/order/${order.no}`}
        className="mt-4 block text-center type-small text-link hover:underline"
      >
        先不付，回订单页
      </Link>
    </div>
  );
}
