import { Suspense } from "react";
import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ChevronLeft, LifeBuoy, Search, TicketCheck, Timer, Zap } from "lucide-react";
import { placeOrder } from "@/app/(shop)/actions";
import { ActionForm } from "@/components/action-form";
import { BrandWash } from "@/components/brand-wash";
import { Container, Skeleton } from "@/components/brand";
import { ProductMark } from "@/components/product-mark";
import { Field } from "@/components/form-bits";
import { QtyField } from "@/components/qty-field";
import { SourceField } from "@/components/source-field";
import { Button, buttonClass } from "@/components/ui/button";
import { brandOf } from "@/lib/brand";
import { get } from "@/lib/db";
import { currentUser } from "@/lib/guard";
import { providers } from "@/lib/payment";
import { getProduct, outOfStock } from "@/lib/shop";
import { platformName, SITE, yuan } from "@/lib/site";

/** 标签页的标题用商品名，摘要用商品说明的第一段。商品不存在或已下架时用通用标题。 */
export async function generateMetadata({
  params,
}: Pick<PageProps<"/p/[id]">, "params">): Promise<Metadata> {
  const { id } = await params;
  await io();
  const p = /^\d+$/.test(id)
    ? get<{ name: string; description: string }>(
        `SELECT name, description FROM products WHERE id = ? AND active = 1`,
        Number(id),
      )
    : undefined;
  if (!p) return { title: "商品详情" };
  const summary = p.description.split("\n")[0].trim().slice(0, 120);
  return { title: p.name, ...(summary && { description: summary }) };
}

export default function Page({ params }: PageProps<"/p/[id]">) {
  return (
    <Container className="relative pt-6 pb-16 sm:pt-10 sm:pb-24">
      <Link
        href="/"
        className="chip pl-2.5 type-small text-link transition-all duration-[400ms] ease-soft hover:-translate-x-0.5"
      >
        <ChevronLeft className="size-4" />
        商店
      </Link>
      <Suspense
        fallback={
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px] lg:gap-16">
            <Skeleton className="h-64" />
            <Skeleton className="h-96" />
          </div>
        }
      >
        <Detail params={params} />
      </Suspense>
    </Container>
  );
}

// 版式：左边是商品的文字信息（两张白色实心卡），右边是一张跟着滚动的下单面板。
// 手机上的顺序是 名称 → 下单面板 → 说明，所以名称下面留了一条跳到说明的链接。
async function Detail({ params }: Pick<PageProps<"/p/[id]">, "params">) {
  const { id } = await params;
  await io(); // 价格和库存每次请求现查
  const p = /^\d+$/.test(id) ? getProduct(Number(id)) : undefined;
  if (!p || !p.active) notFound();

  const channels = providers();
  // 填了站外付款链接的商品不在本站下单：下单面板换成一个去付款的按钮，库存也不看本站的。
  // 把对方的域名写给买家看，跳过去以后能对得上。
  const payHost = p.buy_url ? new URL(p.buy_url).hostname : "";
  // 站外付款的商品一般不看本站库存；只有「那边卖的是本站兑换码、本站又没货了」才算售罄，见 outOfStock
  const soldOut = outOfStock(p);
  // 既没有站外付款链接、本站又没有能用的支付方式：这件商品现在买不了，不摆一张交不出去的表单
  const notYet = !payHost && channels.length === 0;
  const user = await currentUser();

  // 写给买家看的平台称呼：认识的写「名字（域名）」，不认识的只写域名
  const payName = platformName(payHost);
  const payAt = payName ? `「${payName}」（${payHost}）` : ` ${payHost} `;
  // 这件商品名下还有没用掉的兑换码，说明那边卖的是本站的兑换码：付完款要回本站取货。
  // 没有的话，货放在那边，付完款直接在那边拿。页面按这个把话说死，不让买家自己猜是哪一种。
  const pickupHere = p.codes_left > 0;
  // 按钮上带着域名，买家点之前就知道要去哪；域名太长时按钮放不下，就只写「去付款」（上面那行已经写了域名）
  const payLabel = payHost.length <= 20 ? `去 ${payHost} 付款` : "去付款";

  const notes = payHost
    ? [
        {
          icon: ArrowUpRight,
          title: "到合作平台付款",
          text: `点按钮会打开合作平台${payAt}的购买页。先看浏览器地址栏是不是 https://${payHost}/ 开头，再下单付款。价格以那边为准，平台可能另收少量手续费；和这里差得多、或者那边显示缺货，先别付，到售后页告诉我们。`,
        },
        pickupHere
          ? {
              icon: TicketCheck,
              title: "回本站取货",
              text: "付款后那边给你的是一串 12 位的兑换码，不是商品本身。回本站的兑换页填进去，才拿到商品，同时会得到一个 K 开头的本站订单号。",
            }
          : {
              icon: Zap,
              title: "自动发货",
              text: "付款成功后，买到的内容直接显示在那边的订单页，不用再回本站。",
            },
        {
          icon: Search,
          title: "查订单",
          text: pickupHere
            ? `付款记录在 ${payHost} 查。取到的商品凭 K 开头的订单号和取货时填的邮箱，在本站「查订单」里随时能再看。`
            : `订单记在 ${payHost}，要回那边查，本站的「查订单」里没有。`,
        },
        {
          icon: LifeBuoy,
          title: "售后工单",
          text: `有问题找本站：到售后页提交，带上订单号；没有本站订单号的，填 ${payHost} 那边的。`,
        },
      ]
    : [
        { icon: Zap, title: "自动发货", text: "付款成功后，卡密直接显示在订单页。" },
        {
          icon: Timer,
          title: `保留 ${SITE.orderTtlMinutes} 分钟`,
          text: "下单后库存为你锁定，超时没付款自动释放。",
        },
        { icon: LifeBuoy, title: "售后工单", text: "卡密有问题，带上订单号到售后页提交。" },
      ];

  const brand = brandOf(p.name);

  return (
    <>
      {brand && <BrandWash brand={brand} variant="page" />}
      <div className="relative mt-6 grid gap-x-16 gap-y-8 lg:grid-cols-[1fr_400px]">
      <header className="lg:col-start-1">
        <div className="flex items-center gap-4">
          <ProductMark name={p.name} />
          <div>
            <p className="font-hand text-[28px] leading-none text-link">Ready when you pay</p>
            <p className="mt-2 font-mono type-small font-medium text-link">{p.category || "数字商品"}</p>
            <h1 className="mt-2 type-serif type-title text-balance sm:type-headline">{p.name}</h1>
          </div>
        </div>
        <a href="#details" className="mt-3 inline-block type-small text-link hover:underline lg:hidden">
          先看商品说明
        </a>
      </header>

      <aside className="card-solid card-tint p-6 sm:p-7 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start">
        <p className="type-title tabular-nums">{yuan(p.price_cents)}</p>
        {payHost ? (
          <>
            {/* 对方的域名可能很长：药丸放不下就截断，下面那句话里有完整的 */}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip">
                <span className="truncate">{soldOut ? "暂时售罄" : `在 ${payHost} 付款`}</span>
              </span>
            </div>
            {/* 对方的域名可能很长又没有连字符，允许在任意位置折行，免得把手机版面撑破 */}
            <p className="mt-3 type-small wrap-anywhere text-muted-foreground">
              {soldOut
                ? "暂时售罄，补货后再来。"
                : pickupHere
                  ? `在合作平台${payAt}付款，付完回本站取货。`
                  : `在合作平台${payAt}付款和发货，本站不收款。`}
            </p>
            {soldOut ? (
              <Button variant="brand" size="xl" disabled className="mt-6 w-full">
                已售罄
              </Button>
            ) : (
              <a
                href={p.buy_url}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: "brand", size: "xl", className: "mt-6 w-full" })}
              >
                {payLabel}
                <ArrowUpRight />
                <span className="sr-only">（在新窗口打开）</span>
              </a>
            )}
            <p className="mt-4 type-small text-muted-foreground">
              {soldOut ? (
                <>
                  已经付过款、手里有兑换码的，码没有作废，补货后到
                  <Link href="/redeem" className="mx-1 whitespace-nowrap text-link hover:underline">
                    兑换页
                  </Link>
                  取货。
                </>
              ) : pickupHere ? (
                <>
                  付款后那边会给你一串 12 位的兑换码（像 7KQ2M9XH4TDW）。回到本站点顶部的「
                  <Link href="/redeem" className="whitespace-nowrap text-link hover:underline">
                    兑换
                  </Link>
                  」，填进去就拿到商品。
                </>
              ) : (
                "付款成功后，买到的内容直接显示在那边的订单页，不用再回本站。"
              )}
            </p>
          </>
        ) : notYet ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip text-muted-foreground">暂未开售</span>
            </div>
            <p className="mt-3 type-small text-muted-foreground">这件商品暂时还不能购买。</p>
            <Button variant="brand" size="xl" disabled className="mt-6 w-full">
              暂未开售
            </Button>
          </>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={soldOut ? "chip text-muted-foreground" : "chip"}>
                {soldOut ? "暂时售罄" : `有货 · 库存 ${p.stock} 件`}
              </span>
              {p.sold > 0 && <span className="chip text-muted-foreground">已售 {p.sold}</span>}
            </div>

            <ActionForm
              action={placeOrder}
              submit={soldOut ? "已售罄" : "立即购买"}
              variant="brand"
              size="xl"
              buttonClassName="w-full"
              disabled={soldOut}
              className="mt-6 space-y-6"
            >
              <input type="hidden" name="productId" value={p.id} />
              <SourceField />
              <QtyField priceCents={p.price_cents} max={Math.min(p.stock, SITE.maxQuantity)}>
                <Field
                  label="接收邮箱"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={user?.email}
                  placeholder="you@example.com"
                  hint="之后凭订单号和这个邮箱查订单，请填常用的。"
                />
                <fieldset className="space-y-2">
                  <legend className="mb-2 type-small font-semibold">支付方式</legend>
                  {channels.map((c, i) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 rounded-full border border-input bg-card px-5 py-3 type-body transition-all duration-[400ms] ease-soft has-checked:border-ring has-checked:ring-1 has-checked:ring-ring"
                    >
                      <input
                        type="radio"
                        name="channel"
                        value={c.id}
                        defaultChecked={i === 0}
                        className="size-4 accent-ring"
                      />
                      {c.label}
                    </label>
                  ))}
                </fieldset>
              </QtyField>
            </ActionForm>
          </>
        )}
      </aside>

      <div id="details" className="space-y-5 lg:col-start-1">
        <section className="card-solid p-6 sm:p-8">
          <h2 className="type-lead font-semibold">商品说明</h2>
          <p className="mt-3 type-body whitespace-pre-wrap">{p.description || "暂无说明。"}</p>
        </section>
        <section className="card-solid p-6 sm:p-8">
          <h2 className="type-lead font-semibold">购买须知</h2>
          <ul className="mt-2 divide-y divide-input">
            {notes.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 py-4 last:pb-0">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F0F9FF] text-link">
                  <Icon className="size-5" strokeWidth={1.6} />
                </span>
                <p className="min-w-0 type-small wrap-anywhere">
                  <span className="font-semibold">{title}。</span>
                  <span className="text-muted-foreground">{text}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
    </>
  );
}
