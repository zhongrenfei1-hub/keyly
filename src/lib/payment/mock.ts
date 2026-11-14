// 模拟支付：不走真钱，在「模拟收银台」点一下就算付款成功。只用于开发和演示。
import { seal, unseal } from "../token.ts";
import type { PaidNotice, PaymentProvider } from "./index.ts";

export const mock: PaymentProvider = {
  id: "mock",
  label: "模拟支付（测试）",

  // 生产环境默认关闭：开着就等于任何人都能不花钱拿货
  enabled: () =>
    process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAY === "1",

  async createPayment(order) {
    return `/pay/mock/${order.no}`;
  },

  async parseNotify(req) {
    const notice = unseal<PaidNotice>("mock-pay", await req.text());
    if (!notice) throw new Error("签名无效");
    return notice;
  },

  ack: "success",
};

/** 生成一份带签名的「支付成功通知」。真实渠道里这一步由支付平台来做。 */
export const mockNotice = (n: PaidNotice) => seal("mock-pay", n, 60);
