// 支付渠道的统一接口。
// 接一个新渠道：在这个目录加一个文件实现 PaymentProvider，再登记到下面的 ALL 里，别处不用改。
import { fulfillOrder, ShopError, type Order } from "../shop.ts";
import { mock } from "./mock.ts";

export type PaidNotice = {
  orderNo: string;
  /** 实付金额（分），发货前会和订单金额核对 */
  amountCents: number;
  /** 支付平台的流水号 */
  tradeNo: string;
};

export interface PaymentProvider {
  id: string;
  /** 展示给买家的名字 */
  label: string;
  /** 这个渠道当前能不能用（缺配置、被禁用时返回 false） */
  enabled(): boolean;
  /** 发起支付，返回买家要去的付款地址 */
  createPayment(
    order: Order,
    urls: { notifyUrl: string; returnUrl: string },
  ): Promise<string>;
  /** 校验支付平台的异步通知。验签失败要抛错；不是「支付成功」的通知返回 null。 */
  parseNotify(req: Request): Promise<PaidNotice | null>;
  /** 处理成功后回给支付平台的应答（多数平台要求固定文本，比如 success） */
  ack: string;
}

const ALL: PaymentProvider[] = [mock];

export const providers = () => ALL.filter((p) => p.enabled());

export const getProvider = (id: string) => providers().find((p) => p.id === id);

/** 支付通知的统一入口：验签 → 核对金额并发货 → 应答。/api/pay/notify/[provider] 直接调它。 */
export async function handleNotify(providerId: string, req: Request): Promise<Response> {
  const provider = getProvider(providerId);
  if (!provider) return new Response("unknown provider", { status: 404 });

  let notice: PaidNotice | null;
  try {
    notice = await provider.parseNotify(req);
  } catch {
    return new Response("bad signature", { status: 400 });
  }

  if (notice) {
    try {
      fulfillOrder(notice.orderNo, notice);
    } catch (e) {
      if (!(e instanceof ShopError)) throw e;
      console.error(`[pay] ${providerId} 通知未处理：${e.message}`, notice);
      return new Response(e.message, { status: 400 });
    }
  }
  return new Response(provider.ack);
}
