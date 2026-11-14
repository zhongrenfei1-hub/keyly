import { openOrder } from "@/app/(shop)/actions";
import { ActionForm } from "@/components/action-form";
import { Container } from "@/components/brand";
import { Field } from "@/components/form-bits";
import { PrefillOrderNo } from "./prefill-no";

export const metadata = { title: "查订单" };

export default function Page() {
  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,24rem)] lg:gap-16 lg:pt-6">
        <div className="order-2 lg:order-1">
          <p className="font-hand text-[34px] leading-none text-link sm:text-[40px]">Find your order</p>
          <h1 className="mt-2 type-serif type-title sm:type-headline">查订单。</h1>
          <p className="mt-3 max-w-md type-body text-pretty text-muted-foreground">
            填下单时的订单号和邮箱。查到以后，状态和卡密都在订单页上，不用再问客服。
          </p>
          <SampleSlip />
          <ul className="mt-6 max-w-md space-y-2 type-small text-muted-foreground">
            <li>本站付款的订单，和用兑换码在本站取过货的，在这里都能打开。</li>
            <li>在合作平台付款、货也在那边发的，这里查不到，请回付款的那个平台查。</li>
          </ul>
        </div>

        <div className="card-solid order-1 p-5 sm:p-8 lg:order-2 lg:sticky lg:top-28">
          <p className="font-hand text-[26px] leading-none text-link">Two things</p>
          <p className="mt-1 mb-6 type-small text-muted-foreground">订单号，加下单时留的邮箱。</p>
          <ActionForm action={openOrder} submit="查询" variant="brand" size="xl" buttonClassName="w-full">
            <Field
              label="订单号"
              name="no"
              mono
              required
              autoComplete="off"
              placeholder="K 开头，共 17 位"
            />
            <Field
              label="下单邮箱"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </ActionForm>
          <PrefillOrderNo />
        </div>
      </div>
    </Container>
  );
}

function SampleSlip() {
  return (
    <figure className="card-solid relative mt-8 max-w-md overflow-hidden p-6 sm:p-7">
      <figcaption className="flex items-center justify-between gap-3">
        <span className="font-hand text-[26px] leading-none text-link">It's yours</span>
        <span className="chip bg-[#ecfdf3] font-medium text-[#15803d]">已发货</span>
      </figcaption>
      <p className="mt-5 font-mono type-small text-muted-foreground">K••••••••••••••••</p>
      <p className="mt-1 type-body font-semibold">ChatGPT Plus · 示例</p>
      <div className="mt-5 space-y-2 border-t border-black/8 pt-5">
        <SlipRow n="01" text="user••••@example.com" />
        <SlipRow n="02" text="••••••••" />
      </div>
      <p className="mt-4 type-caption text-muted-foreground">示意。真实卡密只在你自己的订单页上。</p>
    </figure>
  );
}

function SlipRow({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-[#f4f7fb] px-3 py-2.5">
      <span className="font-mono type-caption text-muted-foreground">{n}</span>
      <span className="font-mono type-small">{text}</span>
    </div>
  );
}
