import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { confirmPaid, markRefunded, redeliver, swapCard } from "@/app/admin/actions";
import { ActionForm } from "@/components/action-form";
import { Empty, Panel, Pill, StatusPill } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/guard";
import { getOrder, orderCardRows, sweepExpired } from "@/lib/shop";
import { fmtTime, yuan } from "@/lib/site";

export const metadata = { title: "订单详情" };

export default function Page({ params }: PageProps<"/admin/orders/[no]">) {
  return (
    <>
      <Link
        href="/admin/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        全部订单
      </Link>
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Detail params={params} />
      </Suspense>
    </>
  );
}

async function Detail({ params }: Pick<PageProps<"/admin/orders/[no]">, "params">) {
  await requireAdmin();
  const { no } = await params;
  await io();
  sweepExpired();
  const o = getOrder(no);
  if (!o) notFound();
  const cards = orderCardRows(o); // 被换掉的卡密也在里面

  const rows: [string, React.ReactNode][] = [
    ["商品", `${o.product_name} × ${o.quantity}`],
    ["金额", o.channel === "redeem" ? "兑换码取货" : yuan(o.amount_cents)],
    ["邮箱", o.email],
    ["渠道", o.channel],
    ["支付流水号", o.trade_no ?? "—"],
    ["下单时间", fmtTime(o.created_at)],
    ["付款时间", o.paid_at ? fmtTime(o.paid_at) : "—"],
  ];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel title={o.no} aside={<StatusPill status={o.status} />}>
        <dl className="space-y-2.5 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-6">
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="text-right break-all">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
          {(o.status === "pending" || o.status === "expired") && (
            <ActionForm
              action={confirmPaid}
              submit="确认已收款并发货"
              size="lg"
              className="space-y-2"
              confirm={`确认这笔订单的 ${yuan(o.amount_cents)} 已经到账？确认后立即发货。`}
            >
              <input type="hidden" name="no" value={o.no} />
            </ActionForm>
          )}
          {o.status === "paid" && (
            <ActionForm action={redeliver} submit="补发" size="lg" className="space-y-2">
              <input type="hidden" name="no" value={o.no} />
            </ActionForm>
          )}
          {(o.status === "paid" || o.status === "delivered") && (
            <ActionForm
              action={markRefunded}
              submit="标记为已退款"
              variant="destructive"
              size="lg"
              className="space-y-2"
              confirm="这里只改订单状态，钱要到支付平台去退。确定标记为已退款？"
            >
              <input type="hidden" name="no" value={o.no} />
            </ActionForm>
          )}
        </div>
        {o.status === "paid" && (
          <p className="mt-3 text-sm text-muted-foreground">
            钱已收到，但下单时锁定的库存已经释放并卖给了别人。给这件商品补充卡密后会自动补发，也可以点「补发」。
          </p>
        )}
      </Panel>

      <Panel title={o.status === "pending" ? "锁定的卡密" : "发出的卡密"}>
        {cards.length === 0 ? (
          <Empty>这笔订单没有发出卡密。</Empty>
        ) : (
          <ol className="space-y-1.5">
            {cards.map((c) => (
              <li key={c.id} className="rounded-lg bg-muted px-3 py-2">
                <p
                  className={
                    c.replaced_at
                      ? "font-mono text-xs break-all text-muted-foreground line-through"
                      : "font-mono text-xs break-all"
                  }
                >
                  {c.content}
                </p>
                {c.replaced_at ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <Pill className="mr-1.5 bg-warning-soft text-warning">已换</Pill>
                    {fmtTime(c.replaced_at)} 换掉，原因：{c.replace_note || "没有填"}
                  </p>
                ) : (
                  o.status === "delivered" && (
                    <ActionForm
                      action={swapCard}
                      submit="换号"
                      variant="outline"
                      size="sm"
                      className="mt-2 flex flex-wrap items-center gap-2 space-y-0"
                      confirm="会从库存里取一张新卡密换给买家，这一张标成已换，不能撤回。确定换号？"
                    >
                      <input type="hidden" name="no" value={o.no} />
                      <input type="hidden" name="cardId" value={c.id} />
                      <Input
                        name="note"
                        required
                        maxLength={200}
                        aria-label="换号原因"
                        placeholder="换号原因，例如：买家说登不上"
                        className="h-8 min-w-0 flex-1 basis-40 bg-background"
                      />
                    </ActionForm>
                  )
                )}
              </li>
            ))}
          </ol>
        )}
        {o.status === "delivered" && cards.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            换号会从这件商品的库存里取一张新卡密给买家。被换掉的卡密留在这笔订单上，不回库存，买家也不再看到。
          </p>
        )}
        {o.status === "pending" && cards.length > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            以上是为这笔订单锁定的卡密，买家付款前看不到。
          </p>
        )}
      </Panel>
    </div>
  );
}
