import { submitTicket } from "@/app/(shop)/actions";
import { ActionForm } from "@/components/action-form";
import { Field, FormPage } from "@/components/form-bits";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SITE } from "@/lib/site";

export const metadata = { title: "售后" };

export default function Page() {
  return (
    <FormPage
      title="售后"
      hand="Need a hand?"
      desc="卡密用不了、付了款没发货、买错了，都可以在这里说。带上订单号处理得更快。"
    >
      {SITE.support && (
        <p className="mb-6 rounded-[16px] bg-muted px-4 py-3.5 type-small">
          也可以直接联系客服：<span className="font-semibold">{SITE.support}</span>
        </p>
      )}
      <ActionForm action={submitTicket} submit="提交" variant="brand" size="xl" buttonClassName="w-full">
        <Field
          label="邮箱"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
        />
        <Field
          label="订单号（没有可以不填）"
          name="orderNo"
          mono
          autoComplete="off"
          placeholder="本站的（K 开头）或合作平台的"
        />
        <div className="space-y-2">
          <Label htmlFor="content" className="type-small font-semibold">
            遇到了什么问题
          </Label>
          <Textarea
            id="content"
            name="content"
            required
            minLength={5}
            maxLength={2000}
            rows={5}
            className="rounded-[16px] bg-background px-4 py-3 text-[17px] transition-all duration-[400ms] ease-soft md:text-[17px]"
            placeholder="尽量说清楚：哪件商品、提示了什么、你希望怎么处理。"
          />
        </div>
      </ActionForm>
    </FormPage>
  );
}
