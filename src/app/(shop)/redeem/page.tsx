import { redeemCode } from "@/app/(shop)/actions";
import { ActionForm } from "@/components/action-form";
import { Field, FormPage } from "@/components/form-bits";
import { SourceField } from "@/components/source-field";

export const metadata = { title: "兑换" };

export default function Page() {
  return (
    <FormPage
      title="兑换码取货"
      hand="Got a code?"
      desc="已经有兑换码？填在这里，马上换成对应的商品。在合作平台付款后拿到的那串 12 位码，也是在这里取货。"
    >
      <ActionForm action={redeemCode} submit="立即兑换" variant="brand" size="xl" buttonClassName="w-full">
        <SourceField />
        <Field
          label="兑换码"
          name="code"
          mono
          required
          autoComplete="off"
          autoCapitalize="characters"
          placeholder="例如 7KQ2M9XH4TDW"
          hint="每个码只能用一次。一次填一个，有几个码就兑几次。"
        />
        <Field
          label="邮箱"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          hint="之后凭订单号和这个邮箱可以再次查看。"
        />
      </ActionForm>
    </FormPage>
  );
}
