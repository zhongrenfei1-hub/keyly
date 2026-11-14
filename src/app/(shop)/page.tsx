import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, PackageOpen } from "lucide-react";
import { BrandWash } from "@/components/brand-wash";
import { Container, Skeleton } from "@/components/brand";
import { DeliveryBelt, DeliveryBeltFallback, type BeltCard } from "@/components/delivery-belt";
import { HeroWash } from "@/components/hero-wash";
import { MetricCards } from "@/components/metric-cards";
import { ProductMark } from "@/components/product-mark";
import { ShelfFolds } from "@/components/shelf-folds";
import { buttonClass } from "@/components/ui/button";
import { brandOf, BRAND_LINE, type Brand } from "@/lib/brand";
import { FaqList } from "@/components/faq-list";
import { providers } from "@/lib/payment";
import { listProducts, outOfStock, type Product } from "@/lib/shop";
import { yuan } from "@/lib/site";
import { cn } from "@/lib/utils";

// 首页先演一遍消卡：商品过了付款线就变成卡密。货架在这条带子下面，打开时不会先看见一排商品。
export default function Home() {
  return (
    <>
      <div className="relative">
        <HeroWash />
        <section className="relative flex h-[calc(100svh-4.25rem)] flex-col">
        <Container className="relative shrink-0 pt-5 sm:pt-8">
          <p className="font-hand text-[30px] leading-none text-link sm:text-[36px]">For students abroad</p>
          <h1 className="mt-3 type-serif type-headline sm:type-display">
            AI 账号，
            <br />
            <span className="text-muted-foreground">即买即用。</span>
          </h1>
          <p className="mt-3 font-hand text-[26px] leading-none text-muted-foreground">Pay once. Use it tonight.</p>
          <div className="mt-5 flex items-center gap-5">
            <a href="#store" className={buttonClass({ variant: "brand", size: "lg" })}>
              看商品
            </a>
            <Link
              href="/orders"
              className="inline-flex items-center type-body text-link transition-colors duration-[400ms] ease-soft hover:underline"
            >
              查订单
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </Container>
        <div className="relative min-h-0 flex-1">
          <Suspense fallback={<DeliveryBeltFallback fit />}>
            <Belt fit />
          </Suspense>
        </div>
      </section>
      </div>
      <section id="store">
        <Container className="py-10 sm:py-14">
          <Suspense fallback={<CatalogSkeleton />}>
            <Catalog />
          </Suspense>
        </Container>
      </section>
      <Steps />
      {/* 为什么在这里买：三张指标卡 */}
      <MetricCards />
      <Faq />
    </>
  );
}

// ── 传送带：现在真的能买的商品，最多 6 件 ─────────────────────────

/** 商品说明的第一句。不按英文句点断，免得把 4.5 这样的写法切开 */
const firstSentence = (s: string) => s.trim().match(/^[^。！？!?\n]+[。！？!?]?/)?.[0].trim() ?? "";

async function Belt({ fit = false }: { fit?: boolean }) {
  await io(); // 能不能买要看当前库存，每次请求现查
  const canPayHere = providers().length > 0;
  const pool = listProducts().filter((p) => !outOfStock(p) && (p.buy_url || canPayHere));
  // 每家先取一件，Claude 这些排在后面的才进得了传送带。不够 6 张再按原顺序补。
  const buyable = [];
  const seen = new Set<string>();
  for (const p of pool) {
    const brand = brandOf(`${p.category} ${p.name}`) ?? p.id;
    if (seen.has(brand)) continue;
    seen.add(brand);
    buyable.push(p);
  }
  for (const p of pool) {
    if (buyable.length >= 6) break;
    if (!buyable.includes(p)) buyable.push(p);
  }
  const cardsSource = buyable.slice(0, 6);
  if (cardsSource.length === 0) return null;
  // 不足 6 件就循环补齐：传送带要铺满三个屏宽才不会露出空档
  const cards: BeltCard[] = Array.from({ length: 6 }, (_, i) => {
    const p = cardsSource[i % cardsSource.length];
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      blurb: firstSentence(p.description),
      price: yuan(p.price_cents),
      theme: i % 3,
      external: Boolean(p.buy_url),
    };
  });
  return <DeliveryBelt cards={cards} fit={fit} />;
}

// ── 货架：分段切换的分类页签 + 纯文字的商品卡 ─────────────────────

const SHELF: { id: Brand; name: string; line: string }[] = [
  { id: "gpt", name: "ChatGPT", line: BRAND_LINE.gpt },
  { id: "codex", name: "Codex", line: BRAND_LINE.codex },
  { id: "grok", name: "Grok", line: BRAND_LINE.grok },
  { id: "claude", name: "Claude", line: BRAND_LINE.claude },
  { id: "muse", name: "MuseAI", line: BRAND_LINE.muse },
];

const HOT = [
  "ChatGPT Plus 半价成品",
  "ChatGPT 微软邮箱普号",
  "Claude 普号",
  "Grok Plus",
  "Codex 250 点",
  "MuseAI 10 亿 Token 成品号",
];

async function Catalog() {
  await io(); // 库存要每次请求现查，不能进预渲染和预取
  const products = listProducts();
  const canPayHere = providers().length > 0;
  const groups = SHELF.map((brand) => {
    const mine = products.filter((p) => brandOf(`${p.category} ${p.name}`) === brand.id);
    const accounts = mine.filter((p) => !p.category.includes("充值"));
    const topups = mine.filter((p) => p.category.includes("充值"));
    return { ...brand, accounts, topups, items: [...accounts, ...topups] };
  }).filter((group) => group.items.length > 0);
  const hotItems = HOT.map((name) => products.find((p) => p.name === name)).filter((p) => p != null);
  const shown = [
    {
      id: "hot",
      name: "热门",
      line: "Start here",
      accounts: hotItems,
      topups: [] as Product[],
      items: hotItems,
    },
    ...groups,
  ].filter((group) => group.items.length > 0);
  const rest = products.filter((p) => !brandOf(`${p.category} ${p.name}`));

  return (
    <>
      <p className="font-hand text-[32px] leading-none text-link">The shelf</p>
      <h2 className="sr-only">全部商品</h2>

      {products.length === 0 ? (
        <div className="card-solid mt-6 px-6 py-16 text-center">
          <PackageOpen className="mx-auto size-8 text-muted-foreground" strokeWidth={1.4} />
          <p className="mt-3 type-body font-semibold">货架还是空的</p>
          <p className="mt-1 type-small text-muted-foreground">商品上架后会出现在这里。</p>
        </div>
      ) : (
        <>
          <ShelfFolds
            brands={shown.map((group) => ({
              id: group.id,
              name: group.name,
              line: group.line,
              count: group.items.length,
              from: fromYuan(Math.min(...group.items.map((p) => p.price_cents))),
            }))}
          >
            {shown.map((group) => (
              <div key={group.id} className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5">
                {group.accounts.map((p) => (
                  <ProductCard key={p.id} p={p} canPayHere={canPayHere} />
                ))}
                {group.topups.length > 0 && group.accounts.length > 0 && (
                  <p className="col-span-full flex items-center gap-3 py-1 type-caption text-muted-foreground">
                    <span className="h-px flex-1 bg-black/10" />
                    充值
                    <span className="h-px flex-1 bg-black/10" />
                  </p>
                )}
                {group.topups.map((p) => (
                  <ProductCard key={p.id} p={p} canPayHere={canPayHere} />
                ))}
              </div>
            ))}
          </ShelfFolds>
          {rest.length > 0 && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((p) => (
                <ProductCard key={p.id} p={p} canPayHere={canPayHere} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

function fromYuan(cents: number) {
  return cents % 100 === 0 ? `¥${cents / 100} 起` : `${yuan(cents)} 起`;
}

/**
 * 商品没有图片，卡片只靠文字：顶上两枚白色小药丸（分类、能不能买），名称，一句说明，
 * 底部是价格、库存的数字徽标和一个圆形的箭头按钮。
 * 能买的是白色实心卡；售罄、暂未开售的是玻璃卡。
 */
function ProductCard({ p, canPayHere }: { p: Product; canPayHere: boolean }) {
  // 站外付款的商品货在对方平台，本站的库存数说明不了什么，不显示；什么时候算售罄见 outOfStock
  const soldOut = outOfStock(p);
  // 既没有站外付款链接、本站又收不了款：还不能买
  const notYet = !p.buy_url && !canPayHere;
  const off = soldOut || notYet;
  const brand = brandOf(p.name);
  return (
    <Link
      href={`/p/${p.id}`}
      className={cn(
        "group card-lift relative flex min-h-0 min-w-0 flex-col overflow-hidden p-4 sm:min-h-[248px] sm:p-7",
        brand ? "card-solid" : off ? "card-glass" : "card-solid card-tint",
      )}
    >
      {brand && <BrandWash brand={brand} variant="card" />}
      <div className="relative flex flex-1 flex-col">
      <div className="flex items-center gap-3">
        <ProductMark name={p.name} />
        <div className="flex min-w-0 flex-wrap gap-2">
        <span className="chip font-mono font-medium text-link">{p.category || "数字商品"}</span>
        {/* 站外付款时这里会写对方的域名，域名可能很长：药丸最宽只到卡片的宽度，放不下就截断，别把整列卡片撑宽 */}
        <span className={cn("chip", off && "text-muted-foreground")}>
          <span className="truncate">
            {soldOut
              ? "暂时售罄"
              : notYet
                ? "暂未开售"
                : p.buy_url
                  ? `在 ${new URL(p.buy_url).hostname} 付款`
                  : "有货"}
          </span>
        </span>
        </div>
      </div>
      <h3 className="mt-4 type-lead font-semibold text-balance">{p.name}</h3>
      {brand && (
        <p className="mt-1 font-hand text-[22px] leading-none text-link">
          {BRAND_LINE[brand]}
        </p>
      )}
      <p className="mt-2 line-clamp-2 type-small text-muted-foreground">{p.description}</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-7">
        <p className="type-lead font-semibold tabular-nums">{yuan(p.price_cents)}</p>
        <div className="flex shrink-0 items-center gap-2">
          {!off && !p.buy_url && (
            <>
              <span className="type-caption text-muted-foreground">库存</span>
              <span className="count-badge">{p.stock}</span>
            </>
          )}
          <span
            className={cn(
              "icon-btn",
              off
                ? "text-muted-foreground"
                : "bg-[#F0F9FF] text-link group-hover:bg-primary group-hover:text-primary-foreground",
            )}
          >
            <ArrowUpRight className="size-5" strokeWidth={1.8} />
            <span className="sr-only">{soldOut ? "售罄" : notYet ? "看看" : "购买"}</span>
          </span>
        </div>
      </div>
      </div>
    </Link>
  );
}

function CatalogSkeleton() {
  return (
    <div className="mt-10 grid gap-5 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[248px]" />
      ))}
    </div>
  );
}

// ── 三步 ────────────────────────────────────────────────────────

// 有的商品在本站付款，有的会跳到合作平台付款。这一页往下的说法要在两种情况下都成立，
// 具体到某件商品怎么付、在哪拿，由商品页自己讲。
const STEPS = [
  { hand: "Choose", title: "选商品", text: "看好价格和说明，点进商品页。" },
  { hand: "Pay", title: "付款", text: "照商品页的提示付款，不用注册账号。有的商品会打开合作平台的购买页。" },
  {
    hand: "It's yours",
    title: "拿到卡密",
    text: "付款成功后自动发货。卡密就是你买到的账号、密码或激活码，具体在哪拿，商品页上写着。",
  },
];

function Steps() {
  return (
    <section>
      <Container className="py-10 sm:py-14">
        <p className="font-hand text-[32px] leading-none text-link">How it works</p>
        <h2 className="mt-1 type-title">三步，拿到卡密。</h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card-solid p-6 sm:p-7">
              <span className="count-badge">0{i + 1}</span>
              <p className="mt-5 font-hand text-[28px] leading-none text-link">{s.hand}</p>
              <p className="mt-1 type-lead font-semibold">{s.title}</p>
              <p className="mt-1 type-small text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}

// ── 常见问题 ────────────────────────────────────────────────────

// 问答的内容在 src/lib/faq.ts，客服对话框也用那一份

function Faq() {
  return (
    <section id="faq">
      <Container className="py-10 sm:py-14">
        <p className="font-hand text-[32px] leading-none text-link">Questions</p>
        <h2 className="mt-1 type-title">常见问题。</h2>
        <FaqList />
      </Container>
    </section>
  );
}
