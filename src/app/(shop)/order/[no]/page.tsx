import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { Ban, Check, Clock, PackageSearch, Undo2, type LucideIcon } from "lucide-react";
import { continuePay, openOrder } from "@/app/(shop)/actions";
import { ActionForm } from "@/components/action-form";
import { Container, Skeleton } from "@/components/brand";
import { Field, FormPage } from "@/components/form-bits";
import { ButtonCopy } from "@/components/ruixen/button-copy";
import { MilestoneStepper } from "@/components/ruixen/milestone-stepper";
import { Button } from "@/components/ui/button";
import { canViewOrder, currentUser } from "@/lib/guard";
import { getOrder, orderCards, sweepExpired, type Order, type OrderStatus } from "@/lib/shop";
import { fmtTime, SITE, yuan } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata = { title: "订单详情" };

export default function Page({ params }: PageProps<"/order/[no]">) {
  return (
    <Suspense
      fallback={
        <Shell>
          <Skeleton className="h-[30rem]" />
        </Shell>
      }
    >
      <OrderView params={params} />
    </Suspense>
  );
}

/** 订单页的版式：窄一点的栏，中间一张白色实心卡 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Container className="max-w-[760px] py-8 sm:py-12">{children}</Container>
  );
}

// 状态色只有两种：等待用橙，完成用绿；关闭和退款用灰
const WAITING = "bg-warning-soft text-warning";
const DONE = "bg-success-soft text-success";
const CLOSED = "bg-muted text-muted-foreground";

const HEAD: Record<OrderStatus, { icon: LucideIcon; tone: string; title: string; hint: string }> = {
  pending: {
    icon: Clock,
    tone: WAITING,
    title: "等待付款",
    hint: "付款成功后，卡密会直接显示在这一页。",
  },
  paid: {
    icon: PackageSearch,
    tone: WAITING,
    title: "已付款，正在补货",
    hint: "钱已经收到，但这件商品刚好卖完了。补货后会自动发到这一页，着急的话请提交工单。",
  },
  delivered: {
    icon: Check,
    tone: DONE,
    title: "发货完成",
    hint: "卡密在下面，请尽快保存到自己的地方。",
  },
  expired: {
    icon: Ban,
    tone: CLOSED,
    title: "订单已关闭",
    hint: `超过 ${SITE.orderTtlMinutes} 分钟没有付款，库存已经释放。还需要的话请重新下单。`,
  },
  refunded: {
    icon: Undo2,
    tone: CLOSED,
    title: "已退款",
    hint: "这笔订单已标记为退款。",
  },
};

async function OrderView({ params }: Pick<PageProps<"/order/[no]">, "params">) {
  const no = (await params).no.toUpperCase();
  await io(); // 订单状态每次请求现查
  sweepExpired();
  const order = getOrder(no);
  const user = await currentUser();
  const owns = Boolean(order && user && user.email === order.email);

  // 订单不存在和没有查看权限显示同一个页面，不泄露订单号是否存在
  if (!order || (!(await canViewOrder(order.no)) && !owns)) {
    return (
      <FormPage title="验证邮箱" hand="One more check" desc="为了保护卡密，换了浏览器或设备，需要再确认一次下单邮箱。">
        <ActionForm action={openOrder} submit="查看订单" variant="brand" size="xl" buttonClassName="w-full">
          <Field label="订单号" name="no" defaultValue={no} mono required autoComplete="off" />
          <Field label="下单邮箱" name="email" type="email" required autoComplete="email" />
        </ActionForm>
      </FormPage>
    );
  }

  const head = HEAD[order.status];
  const cards = orderCards(order);
  const live = order.status === "pending" || order.status === "paid" || order.status === "delivered";

  return (
    <Shell>
      <div className="card-solid p-6 sm:p-10">
        <div className="flex items-start gap-4">
          <span className={cn("grid size-12 shrink-0 place-items-center rounded-full", head.tone)}>
            <head.icon className="size-6" strokeWidth={2} />
          </span>
          <div>
            <h1 className="type-title">{head.title}</h1>
            <p className="mt-1 type-small text-muted-foreground">{head.hint}</p>
          </div>
        </div>

        {order.status === "delivered" && <Cards cards={cards} />}
        {order.status === "pending" && <PayPrompt order={order} />}

        <div className="mt-9 grid gap-8 sm:grid-cols-[1fr_210px] sm:gap-10">
          <dl className="divide-y divide-input border-y border-input type-small">
            <Row label="订单号">
              <span className="font-mono break-all">{order.no}</span>
            </Row>
            <Row label="商品">
              {order.product_name} × {order.quantity}
            </Row>
            <Row label="金额">
              <span className="tabular-nums">
                {order.channel === "redeem" ? "兑换码取货" : yuan(order.amount_cents)}
              </span>
            </Row>
            <Row label="邮箱">
              <span className="break-all">{order.email}</span>
            </Row>
          </dl>
          {live && (
            <MilestoneStepper
              variant="compact"
              className="pt-1"
              currentMilestone={order.status === "pending" ? 1 : order.status === "paid" ? 2 : 3}
              milestones={[
                { id: 1, title: "提交订单", date: fmtTime(order.created_at) },
                {
                  id: 2,
                  title: order.channel === "redeem" ? "验证兑换码" : "完成付款",
                  date: order.paid_at ? fmtTime(order.paid_at) : undefined,
                },
                { id: 3, title: "自动发货" },
              ]}
            />
          )}
        </div>
      </div>

      <p className="mt-6 text-center type-caption text-muted-foreground">
        请记下订单号。之后可以在
        <Link href="/orders" className="mx-1 text-link hover:underline">
          查订单
        </Link>
        里凭订单号和邮箱再次打开；卡密有问题，请到
        <Link href="/support" className="mx-1 text-link hover:underline">
          售后
        </Link>
        提交工单。
      </p>
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 py-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function Cards({ cards }: { cards: string[] }) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="type-body font-semibold">
          你的卡密
          <span className="ml-2 type-small font-normal text-muted-foreground">共 {cards.length} 条</span>
        </h2>
        {cards.length > 1 && (
          <ButtonCopy value={cards.join("\n")} label="复制全部" copiedLabel="已复制" sound={false} />
        )}
      </div>
      <ol className="mt-3 space-y-2">
        {cards.map((card, i) => (
          <li key={i} className="flex items-center gap-3 rounded-[16px] bg-muted py-2.5 pr-2.5 pl-4">
            <span className="type-caption text-muted-foreground tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <code className="min-w-0 flex-1 font-mono type-small break-all select-all">{card}</code>
            <ButtonCopy value={card} label={`复制第 ${i + 1} 条`} showLabel={false} sound={false} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function PayPrompt({ order }: { order: Order }) {
  return (
    <form action={continuePay} className="mt-8">
      <input type="hidden" name="no" value={order.no} />
      <p className="rounded-[16px] border border-dashed border-input px-4 py-5 text-center type-small text-muted-foreground">
        付款成功后，{order.quantity} 条卡密会显示在这里。
      </p>
      <Button type="submit" variant="brand" size="xl" className="mt-5 w-full">
        去支付 {yuan(order.amount_cents)}
      </Button>
      <p className="mt-3 text-center type-caption text-muted-foreground">
        库存为你保留到 <span className="font-semibold text-foreground">{fmtTime(order.expires_at)}</span>
        ，超时订单会自动关闭。
      </p>
    </form>
  );
}
