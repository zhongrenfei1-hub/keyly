// 业务核心：商品、库存、下单、发货、兑换。全部同步、可单测，不依赖 Next。
import { randomInt } from "node:crypto";
import { all, get, run, tx } from "./db.ts";
import { SITE } from "./site.ts";

/** 可以直接展示给买家或管理员看的错误 */
export class ShopError extends Error {}

export type Product = {
  id: number;
  name: string;
  category: string;
  description: string;
  price_cents: number;
  active: number;
  created_at: number;
  /**
   * 站外付款链接（比如链动小铺的商品页），没有就是空串。
   * 填了以后前台不在本站下单，购买按钮直接把买家送到这个地址付款。
   */
  buy_url: string;
  /** 未售出、未被锁定的卡密数 */
  stock: number;
  /** 已发货的件数 */
  sold: number;
  /** 这件商品名下还没用掉的兑换码数 */
  codes_left: number;
};

/**
 * 这件商品现在是不是「本站没货可发」。首页、商品页、后台列表和概览待办都用这一条。
 * - 在本站下单的商品：没有未售卡密就是没货。
 * - 站外付款的商品：货放在对方平台时，本站没有卡密是正常的，不算没货；
 *   但名下还有没用掉的兑换码时，买家会拿着码回本站取货，没有卡密就发不出去，算没货。
 */
export const outOfStock = (p: Product) => p.stock === 0 && (!p.buy_url || p.codes_left > 0);

export type OrderStatus =
  | "pending" // 已下单，卡密已锁定，等付款
  | "paid" // 钱收到了但库存不够，等补货后补发
  | "delivered" // 已发货
  | "expired" // 超时未付，库存已释放
  | "refunded"; // 已退款（后台手动标记）

export type Order = {
  id: number;
  no: string;
  product_id: number;
  product_name: string;
  quantity: number;
  amount_cents: number;
  email: string;
  status: OrderStatus;
  /** 支付渠道 id；兑换码取货的订单是 redeem */
  channel: string;
  trade_no: string | null;
  created_at: number;
  expires_at: number;
  paid_at: number | null;
  /** 后台标记退款的时间 */
  refunded_at: number | null;
  /** 订单来源（从哪个推广渠道来的），没有就是空串 */
  source: string;
};

/** 后台看的一张卡密：被换掉的也在，replaced_at 不为空就是已经换掉了 */
export type CardRow = {
  id: number;
  content: string;
  replaced_at: number | null;
  replace_note: string;
};

const PRODUCT_SQL = `
  SELECT p.*,
    (SELECT COUNT(*) FROM cards c WHERE c.product_id = p.id AND c.order_id IS NULL) AS stock,
    (SELECT COALESCE(SUM(o.quantity), 0) FROM orders o WHERE o.product_id = p.id AND o.status = 'delivered') AS sold,
    (SELECT COUNT(*) FROM redeem_codes r WHERE r.product_id = p.id AND r.order_id IS NULL) AS codes_left
  FROM products p`;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 120 || !EMAIL.test(email))
    throw new ShopError("邮箱格式不对");
  return email;
}

/**
 * 整理后台填的站外付款链接：留空返回空串；填了必须是 https 开头的完整地址。
 * 这个地址会原样放进买家点的链接里，所以别的协议（比如 javascript:）一律不收。
 * 存的是解析后的写法（中文会转码），长度也按它算：这样存进去的值再交回来一定还能通过。
 */
export function cleanBuyUrl(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const u = URL.canParse(s) ? new URL(s) : null;
  if (!u || u.protocol !== "https:" || u.username || u.password || u.href.length > 300)
    throw new ShopError(
      "付款链接要填 https:// 开头的完整地址，最多 300 个字符（中文按转码后的长度算）",
    );
  return u.href;
}

// 去掉容易看混的 0/O/1/I
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function randomCode(len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** K + 北京时间年月日 + 10 位随机码，例如 K261113H7K2M9QX4T */
function newOrderNo(now: number): string {
  const day = new Date(now + 8 * 3600_000)
    .toISOString()
    .slice(2, 10)
    .replaceAll("-", "");
  return `K${day}${randomCode(10)}`;
}

/** 把超时未付的订单关掉，锁定的卡密放回库存 */
export function sweepExpired(now = Date.now()): void {
  const stale = get(
    `SELECT 1 FROM orders WHERE status = 'pending' AND expires_at < ? LIMIT 1`,
    now,
  );
  if (!stale) return;
  tx(() => {
    run(
      `UPDATE cards SET order_id = NULL WHERE order_id IN
         (SELECT id FROM orders WHERE status = 'pending' AND expires_at < ?)`,
      now,
    );
    run(
      `UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at < ?`,
      now,
    );
  });
}

export function listOrdersByEmail(email: string): Order[] {
  return all<Order>(
    `SELECT * FROM orders WHERE email = ? ORDER BY id DESC LIMIT 50`,
    email,
  );
}

export function listProducts(opts: { includeInactive?: boolean } = {}): Product[] {
  sweepExpired();
  const where = opts.includeInactive ? "" : "WHERE p.active = 1";
  return all<Product>(`${PRODUCT_SQL} ${where} ORDER BY p.id DESC`);
}

export function getProduct(id: number): Product | undefined {
  sweepExpired();
  return get<Product>(`${PRODUCT_SQL} WHERE p.id = ?`, id);
}

export const getOrder = (no: string) =>
  get<Order>(`SELECT * FROM orders WHERE no = ?`, no);

/**
 * 订单现在生效的卡密，被换掉的不算。
 * 买家只在「已发货」时能看到；后台传 any 可看任何状态。
 */
export function orderCards(order: Order, scope: "buyer" | "any" = "buyer"): string[] {
  if (scope === "buyer" && order.status !== "delivered") return [];
  return all<{ content: string }>(
    `SELECT content FROM cards WHERE order_id = ? AND replaced_at IS NULL ORDER BY id`,
    order.id,
  ).map((c) => c.content);
}

/** 后台用：这笔订单名下的全部卡密，包括被换掉的。 */
export const orderCardRows = (order: Order) =>
  all<CardRow>(
    `SELECT id, content, replaced_at, replace_note FROM cards WHERE order_id = ? ORDER BY id`,
    order.id,
  );

/** 给订单配 n 张卡密，要么全配上要么一张不动。必须在事务里调用。 */
function takeCards(productId: number, orderId: number, n: number): boolean {
  const { free } = get<{ free: number }>(
    `SELECT COUNT(*) AS free FROM cards WHERE product_id = ? AND order_id IS NULL`,
    productId,
  )!;
  if (free < n) return false;
  run(
    `UPDATE cards SET order_id = ? WHERE id IN
       (SELECT id FROM cards WHERE product_id = ? AND order_id IS NULL ORDER BY id LIMIT ?)`,
    orderId,
    productId,
    n,
  );
  return true;
}

/** 下单：校验 → 建订单 → 锁定卡密。库存不够整单回滚。 */
export function createOrder(
  input: {
    productId: number;
    quantity: number;
    email: string;
    channel: string;
    /** 订单来源，去掉首尾空白后最多留 40 个字符 */
    source?: string;
  },
  now = Date.now(),
): Order {
  const email = cleanEmail(input.email);
  const q = input.quantity;
  if (!Number.isInteger(q) || q < 1 || q > SITE.maxQuantity)
    throw new ShopError(`购买数量需在 1–${SITE.maxQuantity} 之间`);

  return tx(() => {
    sweepExpired(now);
    const p = get<Product>(
      `SELECT * FROM products WHERE id = ? AND active = 1`,
      input.productId,
    );
    if (!p) throw new ShopError("商品不存在或已下架");
    // 站外付款的商品不在本站下单。商品页已经不给表单了，这里再拦一道：
    // 站主填链接之前就打开着的旧页面、或者直接提交的请求，都走不通。
    if (p.buy_url)
      throw new ShopError("这件商品改到合作平台付款了，请刷新页面再点「去付款」");

    const no = newOrderNo(now);
    const { lastInsertRowid } = run(
      `INSERT INTO orders (no, product_id, product_name, quantity, amount_cents, email, status, channel, source, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      no,
      p.id,
      p.name,
      q,
      p.price_cents * q,
      email,
      input.channel,
      (input.source ?? "").trim().slice(0, 40),
      now,
      now + SITE.orderTtlMinutes * 60_000,
    );
    if (!takeCards(p.id, Number(lastInsertRowid), q))
      throw new ShopError("库存不足，请减少数量或稍后再试");
    return getOrder(no)!;
  });
}

/**
 * 支付成功后调用（支付通知、后台手动补单都走这里）。
 * - 幂等：同一订单重复通知不会重复发货。
 * - 金额不符直接拒绝。
 * - 订单已超时、库存又被别人买走时，状态记为 paid，等补货后在后台补发。
 */
export function fulfillOrder(
  no: string,
  paid: { amountCents: number; tradeNo: string },
  now = Date.now(),
): Order {
  return tx(() => {
    const o = getOrder(no);
    if (!o) throw new ShopError("订单不存在");
    if (o.status !== "pending" && o.status !== "expired") return o;
    if (paid.amountCents !== o.amount_cents)
      throw new ShopError("支付金额与订单不符");

    const { held } = get<{ held: number }>(
      `SELECT COUNT(*) AS held FROM cards WHERE order_id = ?`,
      o.id,
    )!;
    const ok =
      held >= o.quantity || takeCards(o.product_id, o.id, o.quantity - held);
    run(
      `UPDATE orders SET status = ?, paid_at = ?, trade_no = ? WHERE id = ?`,
      ok ? "delivered" : "paid",
      now,
      paid.tradeNo,
      o.id,
    );
    return getOrder(no)!;
  });
}

/** 后台补发：给「已付款待发货」的订单重新配卡密 */
export function retryDelivery(no: string): Order {
  return tx(() => {
    const o = getOrder(no);
    if (!o || o.status !== "paid")
      throw new ShopError("只有「已付款，待发货」的订单可以补发");
    if (!takeCards(o.product_id, o.id, o.quantity))
      throw new ShopError("库存仍然不足，请先补充卡密");
    run(`UPDATE orders SET status = 'delivered' WHERE id = ?`, o.id);
    return getOrder(no)!;
  });
}

/** 后台标记退款。只改状态，钱要到支付平台去退；已发出的卡密不会回到库存。 */
export function refundOrder(no: string, now = Date.now()): Order {
  return tx(() => {
    const o = getOrder(no);
    if (!o || (o.status !== "paid" && o.status !== "delivered"))
      throw new ShopError("只有已付款的订单可以标记退款");
    run(
      `UPDATE orders SET status = 'refunded', refunded_at = ? WHERE id = ?`,
      now,
      o.id,
    );
    return getOrder(no)!;
  });
}

/**
 * 后台换号：从同一件商品的库存里取一张新卡密挂到订单上，旧的那张标成「已换掉」。
 * 旧卡密仍然挂在这笔订单上，不回库存。
 */
export function replaceCard(
  orderNo: string,
  cardId: number,
  note: string,
  now = Date.now(),
): Order {
  return tx(() => {
    const o = getOrder(orderNo);
    if (!o || o.status !== "delivered")
      throw new ShopError("只有「已发货」的订单可以换号");
    const card = get<{ replaced_at: number | null }>(
      `SELECT replaced_at FROM cards WHERE id = ? AND order_id = ?`,
      cardId,
      o.id,
    );
    if (!card) throw new ShopError("这张卡密不属于这笔订单");
    if (card.replaced_at !== null) throw new ShopError("这张卡密已经换过了");
    if (!takeCards(o.product_id, o.id, 1))
      throw new ShopError("库存不足，先补货再换号");
    run(
      `UPDATE cards SET replaced_at = ?, replace_note = ? WHERE id = ?`,
      now,
      note.trim().slice(0, 200),
      cardId,
    );
    return o;
  });
}

/**
 * 兑换码取货：一个码换一张卡密，生成一笔 0 元订单。缺货时不消耗兑换码。
 * source 是订单来源，和下单时一样只用于统计，去掉首尾空白后最多留 40 个字符。
 */
export function redeem(
  codeRaw: string,
  emailRaw: string,
  source = "",
  now = Date.now(),
): Order {
  const email = cleanEmail(emailRaw);
  const code = codeRaw.trim().toUpperCase();
  return tx(() => {
    const c = get<{ code: string; product_id: number; order_id: number | null }>(
      `SELECT * FROM redeem_codes WHERE code = ?`,
      code,
    );
    // 来兑换的多半是在别的平台付过钱的买家，报错要说清下一步
    if (!c)
      throw new ShopError(
        "兑换码无效，请检查有没有输错。拿到的如果已经是账号或卡密，直接用就行，不用兑换",
      );
    if (c.order_id)
      throw new ShopError(
        "兑换码已被使用。是你自己兑换的话，到「查订单」凭当时的订单号和邮箱再打开；订单号找不到了，带上这个兑换码到售后页提交工单",
      );

    const p = get<Product>(`SELECT * FROM products WHERE id = ?`, c.product_id)!;
    const no = newOrderNo(now);
    const { lastInsertRowid } = run(
      `INSERT INTO orders (no, product_id, product_name, quantity, amount_cents, email, status, channel, source, created_at, expires_at, paid_at)
       VALUES (?, ?, ?, 1, 0, ?, 'delivered', 'redeem', ?, ?, ?, ?)`,
      no,
      p.id,
      p.name,
      email,
      source.trim().slice(0, 40),
      now,
      now,
      now,
    );
    const orderId = Number(lastInsertRowid);
    if (!takeCards(p.id, orderId, 1))
      throw new ShopError(
        "这件商品暂时缺货，兑换码没有作废，补货后可以再来兑换。着急的话到售后页提交工单",
      );
    run(`UPDATE redeem_codes SET order_id = ? WHERE code = ?`, orderId, code);
    return getOrder(no)!;
  });
}
