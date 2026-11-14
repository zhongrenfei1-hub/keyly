"use server";

// 前台的 Server Action：下单、支付、查单、兑换、提工单。
import { redirect } from "next/navigation";
import type { FormState } from "@/components/action-form";
import { run } from "@/lib/db";
import { grantOrder, origin, throttle } from "@/lib/guard";
import { getProvider, handleNotify } from "@/lib/payment";
import { mockNotice } from "@/lib/payment/mock";
import {
  cleanEmail,
  createOrder,
  getOrder,
  redeem,
  ShopError,
  sweepExpired,
  type Order,
} from "@/lib/shop";

const TOO_FAST: FormState = { error: "操作太频繁了，请过几分钟再试" };

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/**
 * 订单来源：买家浏览器报上来的，只用于统计，不拿它做任何判断。
 * 这里只留安全的字符，长度由 createOrder 和 redeem 截断。
 */
const sourceOf = (form: FormData) =>
  text(form, "source").replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "");

/** 业务错误原样告诉用户，其他错误继续往上抛 */
function fail(e: unknown): FormState {
  if (e instanceof ShopError) return { error: e.message };
  throw e;
}

/** 把买家送到支付渠道的付款页 */
async function goPay(order: Order): Promise<FormState> {
  const provider = getProvider(order.channel);
  if (!provider) return { error: "这种支付方式暂时不可用，请换一种重新下单" };
  const base = await origin();
  redirect(
    await provider.createPayment(order, {
      notifyUrl: `${base}/api/pay/notify/${provider.id}`,
      returnUrl: `${base}/order/${order.no}`,
    }),
  );
}

export async function placeOrder(_: FormState, form: FormData): Promise<FormState> {
  if (!(await throttle("order", 12, 10))) return TOO_FAST;
  if (!getProvider(text(form, "channel"))) return { error: "请选择支付方式" };

  let order: Order;
  try {
    order = createOrder({
      productId: Number(text(form, "productId")),
      quantity: Number(text(form, "quantity")),
      email: text(form, "email"),
      channel: text(form, "channel"),
      source: sourceOf(form),
    });
  } catch (e) {
    return fail(e);
  }
  await grantOrder(order.no);
  return goPay(order);
}

/** 订单页上的「去支付」：订单还在待付款就再去一次付款页，否则回订单页看最新状态 */
export async function continuePay(form: FormData): Promise<void> {
  sweepExpired();
  const order = getOrder(text(form, "no"));
  if (!order) redirect("/orders");
  if (order.status === "pending") await goPay(order);
  redirect(`/order/${order.no}`);
}

/** 模拟收银台的「确认支付」：自己给自己发一份带签名的支付成功通知，走和真实渠道一样的入口 */
export async function mockPay(form: FormData): Promise<void> {
  const order = getOrder(text(form, "no"));
  if (!order) redirect("/");
  await handleNotify(
    "mock",
    new Request("http://mock.local/notify", {
      method: "POST",
      body: mockNotice({
        orderNo: order.no,
        amountCents: order.amount_cents,
        tradeNo: `MOCK${Date.now()}`,
      }),
    }),
  );
  redirect(`/order/${order.no}`);
}

/** 用「订单号 + 下单邮箱」换取这笔订单的查看权限 */
export async function openOrder(_: FormState, form: FormData): Promise<FormState> {
  if (!(await throttle("lookup", 10, 10))) return TOO_FAST;
  const order = getOrder(text(form, "no").toUpperCase());
  if (!order || order.email !== text(form, "email").toLowerCase())
    return {
      error:
        "订单号或邮箱不对。本站的订单号是 K 开头、共 17 位；在合作平台付款的订单，请回付款的那个平台查。",
    };
  await grantOrder(order.no);
  redirect(`/order/${order.no}`);
}

export async function redeemCode(_: FormState, form: FormData): Promise<FormState> {
  if (!(await throttle("redeem", 10, 10))) return TOO_FAST;
  let order: Order;
  try {
    order = redeem(text(form, "code"), text(form, "email"), sourceOf(form));
  } catch (e) {
    return fail(e);
  }
  await grantOrder(order.no);
  redirect(`/order/${order.no}`);
}

/**
 * 客服对话框的「登录」：订单号 + 下单邮箱对得上才算买家。
 * 对话框每次留言都会再交一遍这两项，这里每次重新核对，不信浏览器里记的状态。
 */
async function chatBuyer(form: FormData): Promise<{ order: Order } | { error: string }> {
  if (!(await throttle("lookup", 10, 10))) return { error: "操作太频繁了，请过几分钟再试" };
  const order = getOrder(text(form, "orderNo").toUpperCase());
  if (!order || order.email !== text(form, "email").toLowerCase())
    return { error: "订单号和下单邮箱对不上。本站的订单号是 K 开头、共 17 位。" };
  return { order };
}

export async function verifyChatBuyer(_: FormState, form: FormData): Promise<FormState> {
  const r = await chatBuyer(form);
  return "order" in r ? { ok: r.order.no } : r;
}

export async function submitChatTicket(_: FormState, form: FormData): Promise<FormState> {
  const r = await chatBuyer(form);
  if (!("order" in r)) return r;
  if (!(await throttle("ticket", 5, 10))) return TOO_FAST;
  const content = text(form, "content");
  if (content.length < 5 || content.length > 2000)
    return { error: "问题描述请写 5 到 2000 个字" };
  run(
    `INSERT INTO tickets (order_no, email, content, created_at) VALUES (?, ?, ?, ?)`,
    r.order.no,
    r.order.email,
    content,
    Date.now(),
  );
  return { ok: "已收到，客服会按你下单留的邮箱联系你。" };
}

export async function submitTicket(_: FormState, form: FormData): Promise<FormState> {
  if (!(await throttle("ticket", 5, 10))) return TOO_FAST;
  let email: string;
  try {
    email = cleanEmail(text(form, "email"));
  } catch (e) {
    return fail(e);
  }
  const content = text(form, "content");
  if (content.length < 5 || content.length > 2000)
    return { error: "问题描述请写 5 到 2000 个字" };
  // 本站的订单号统一成大写；别的平台的订单号原样留着，免得改了大小写以后对不上
  const orderNo = text(form, "orderNo").slice(0, 40);
  run(
    `INSERT INTO tickets (order_no, email, content, created_at) VALUES (?, ?, ?, ?)`,
    /^k[0-9a-z]{16}$/i.test(orderNo) ? orderNo.toUpperCase() : orderNo,
    email,
    content,
    Date.now(),
  );
  return { ok: "已收到，客服会按你留的邮箱联系你。" };
}
