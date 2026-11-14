// 钱和库存这条线的自检：npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { db, get, run } from "./db.ts";
import {
  cleanBuyUrl,
  createOrder,
  fulfillOrder,
  getOrder,
  getProduct,
  orderCardRows,
  orderCards,
  outOfStock,
  redeem,
  refundOrder,
  replaceCard,
  retryDelivery,
  ShopError,
  sweepExpired,
} from "./shop.ts";

// 这份测试会往库里写数据，只能对着内存库跑。
assert.equal(process.env.DATABASE_FILE, ":memory:", "请用 npm test 运行");

const MIN = 60_000;

function product(cards: number, priceCents = 1000): number {
  const id = Number(
    run(
      `INSERT INTO products (name, price_cents, created_at) VALUES ('测试商品', ?, 0)`,
      priceCents,
    ).lastInsertRowid,
  );
  addCards(id, cards);
  return id;
}

let serial = 0;
function addCards(productId: number, n: number) {
  for (let i = 0; i < n; i++)
    run(
      `INSERT INTO cards (product_id, content, created_at) VALUES (?, ?, 0)`,
      productId,
      `CARD-${++serial}`,
    );
}

const buy = (productId: number, quantity = 1, now?: number) =>
  createOrder({ productId, quantity, email: " Buyer@Example.com ", channel: "mock" }, now);

test("下单锁库存，付款后发货，重复通知不重复发", () => {
  const p = product(3);
  const o = buy(p, 2);
  assert.equal(o.status, "pending");
  assert.equal(o.amount_cents, 2000);
  assert.equal(o.email, "buyer@example.com");
  assert.equal(getProduct(p)!.stock, 1, "锁定的卡密不算库存");
  assert.deepEqual(orderCards(o), [], "没付款看不到卡密");

  const paid = fulfillOrder(o.no, { amountCents: 2000, tradeNo: "T1" });
  assert.equal(paid.status, "delivered");
  const cards = orderCards(paid);
  assert.equal(cards.length, 2);

  const again = fulfillOrder(o.no, { amountCents: 2000, tradeNo: "T1-重复" });
  assert.equal(again.trade_no, "T1", "重复通知不改订单");
  assert.deepEqual(orderCards(again), cards);
  assert.equal(getProduct(p)!.stock, 1);
  assert.equal(getProduct(p)!.sold, 2);
});

test("金额不符不发货", () => {
  const p = product(1);
  const o = buy(p);
  assert.throws(
    () => fulfillOrder(o.no, { amountCents: 1, tradeNo: "T2" }),
    ShopError,
  );
  assert.equal(getOrder(o.no)!.status, "pending");
});

test("库存不足、数量越界、商品下架都不能下单，也不占库存", () => {
  const p = product(1);
  assert.throws(() => buy(p, 2), /库存不足/);
  assert.throws(() => buy(p, 0), ShopError);
  assert.throws(() => buy(p, 1.5), ShopError);
  assert.throws(() => buy(p, 999), ShopError);
  assert.equal(getProduct(p)!.stock, 1);
  assert.equal(
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM orders WHERE product_id = ?`, p)!.n,
    0,
    "失败的下单整单回滚",
  );

  run(`UPDATE products SET active = 0 WHERE id = ?`, p);
  assert.throws(() => buy(p), /下架/);
  assert.throws(
    () => createOrder({ productId: p, quantity: 1, email: "不是邮箱", channel: "mock" }),
    /邮箱/,
  );
});

test("超时未付释放库存；迟到的付款有货就发", () => {
  const p = product(1);
  const t0 = Date.now();
  const o = buy(p, 1, t0);
  assert.equal(getProduct(p)!.stock, 0);

  sweepExpired(t0 + 16 * MIN);
  assert.equal(getOrder(o.no)!.status, "expired");
  assert.equal(getProduct(p)!.stock, 1, "库存放回");

  const late = fulfillOrder(o.no, { amountCents: 1000, tradeNo: "T3" });
  assert.equal(late.status, "delivered");
  assert.equal(orderCards(late).length, 1);
});

test("迟到的付款没货时转「待发货」，补货后补发；退款后买家看不到卡密", () => {
  const p = product(1);
  // 第一单是 16 分钟前下的，已超时；库存被现在这笔第二单买走
  const first = buy(p, 1, Date.now() - 16 * MIN);
  const second = buy(p);
  fulfillOrder(second.no, { amountCents: 1000, tradeNo: "T4" });
  assert.equal(getOrder(first.no)!.status, "expired");

  const late = fulfillOrder(first.no, { amountCents: 1000, tradeNo: "T5" });
  assert.equal(late.status, "paid", "钱收到了但没货");
  assert.deepEqual(orderCards(late, "any"), []);
  assert.throws(() => retryDelivery(first.no), /库存仍然不足/);

  addCards(p, 1);
  const sent = retryDelivery(first.no);
  assert.equal(sent.status, "delivered");
  assert.equal(orderCards(sent).length, 1);

  const refunded = refundOrder(first.no);
  assert.equal(refunded.status, "refunded");
  assert.deepEqual(orderCards(refunded), [], "退款后买家侧不再显示");
  assert.equal(orderCards(refunded, "any").length, 1, "后台仍能查到发过哪张");
  assert.equal(getProduct(p)!.stock, 0, "发出去的卡密不回库存");
  assert.throws(() => refundOrder(first.no), ShopError);
});

test("兑换码只能用一次，缺货时不消耗", () => {
  const p = product(0);
  run(
    `INSERT INTO redeem_codes (code, product_id, created_at) VALUES ('ABCD2345', ?, 0)`,
    p,
  );
  assert.throws(() => redeem("NOPE", "a@b.co"), /无效/);
  assert.throws(() => redeem("abcd2345", "a@b.co"), /缺货/);

  addCards(p, 1);
  const o = redeem(" abcd2345 ", "a@b.co");
  assert.equal(o.status, "delivered");
  assert.equal(o.amount_cents, 0);
  assert.equal(o.channel, "redeem");
  assert.equal(orderCards(o).length, 1);
  assert.throws(() => redeem("ABCD2345", "a@b.co"), /已被使用/);
});

test("订单来源去掉首尾空白，最多留 40 个字符，不传就是空串", () => {
  const p = product(2);
  assert.equal(buy(p).source, "");
  const o = createOrder({
    productId: p,
    quantity: 1,
    email: "a@b.co",
    channel: "mock",
    source: `  ${"推".repeat(50)}  `,
  });
  assert.equal(o.source, "推".repeat(40));
});

test("站外付款链接只收 https 的完整地址，留空就是在本站下单", () => {
  assert.equal(cleanBuyUrl("  "), "");
  assert.equal(cleanBuyUrl(" https://wzyp.cn/item/abc123 "), "https://wzyp.cn/item/abc123");
  const TAB = String.fromCharCode(9);
  const NEWLINE = String.fromCharCode(10);
  for (const bad of [
    "wzyp.cn/item/abc123",
    "//wzyp.cn/item/abc123",
    "http://wzyp.cn/item/abc123",
    "javascript:alert(1)",
    `java${TAB}script:alert(1)`,
    "data:text/html,x",
    "https://",
    "https://user:pw@wzyp.cn/item/abc123",
    "https://user@wzyp.cn/item/abc123",
    "https://:pw@wzyp.cn/item/abc123",
    `https://wzyp.cn/${"a".repeat(300)}`,
    // 中文存进去会转码，一个字变成 9 个字符：原文不长，转码后超了也不收
    `https://wzyp.cn/item/${"货".repeat(40)}`,
  ])
    assert.throws(() => cleanBuyUrl(bad), ShopError, bad);

  // 存的是解析后的写法，长度按它算：正好 300 个字符能存，301 个不能
  const base = "https://wzyp.cn/";
  assert.equal(cleanBuyUrl(base + "a".repeat(300 - base.length)).length, 300);
  assert.throws(() => cleanBuyUrl(base + "a".repeat(301 - base.length)), ShopError);
  assert.equal(cleanBuyUrl("HTTPS://WZYP.CN/Item"), "https://wzyp.cn/Item");
  assert.equal(cleanBuyUrl(`ht${TAB}tps://wzyp.cn/a${NEWLINE}b`), "https://wzyp.cn/ab");
  // 存进去的值再交回来（编辑商品时表单就是这么做的）一定还能通过，而且不变
  const once = cleanBuyUrl(`https://wzyp.cn/item/${"货".repeat(20)}`);
  assert.equal(cleanBuyUrl(once), once);

  const p = product(0);
  assert.equal(getProduct(p)!.buy_url, "", "不填就是空串");
});

test("站外付款的商品不在本站下单；什么时候算本站没货", () => {
  const p = product(1);
  assert.equal(outOfStock(getProduct(p)!), false);
  run(`UPDATE products SET buy_url = 'https://wzyp.cn/item/abc123' WHERE id = ?`, p);
  assert.throws(() => buy(p), /合作平台/);
  assert.equal(getProduct(p)!.stock, 1, "被拦下的下单不占库存");

  // 货放在那边：本站没有卡密也不算没货
  const there = product(0);
  run(`UPDATE products SET buy_url = 'https://wzyp.cn/item/there' WHERE id = ?`, there);
  assert.equal(outOfStock(getProduct(there)!), false);
  // 那边只卖本站兑换码：还有码没用掉、本站又没卡密，就算没货
  run(
    `INSERT INTO redeem_codes (code, product_id, created_at) VALUES ('WXYZ2345', ?, 0)`,
    there,
  );
  assert.equal(getProduct(there)!.codes_left, 1);
  assert.equal(outOfStock(getProduct(there)!), true);
  addCards(there, 1);
  assert.equal(outOfStock(getProduct(there)!), false);

  // 兑换不走下单那条路，站外付款的商品照常能兑换；来源和下单一样记下来
  const o = redeem("wxyz2345", "a@b.co", `  ${"推".repeat(50)}  `);
  assert.equal(o.status, "delivered");
  assert.equal(o.source, "推".repeat(40));
  assert.equal(getProduct(there)!.codes_left, 0);
  assert.equal(outOfStock(getProduct(there)!), false, "码都用掉了，又回到货在那边的情形");

  // 在本站下单的商品：没有卡密就是没货
  assert.equal(outOfStock(getProduct(product(0))!), true);
});

test("退款时记下退款时间", () => {
  const p = product(1);
  const o = buy(p);
  const paid = fulfillOrder(o.no, { amountCents: 1000, tradeNo: "T6" }, 1000);
  assert.equal(paid.refunded_at, null);
  const refunded = refundOrder(o.no, 5000);
  assert.equal(refunded.paid_at, 1000);
  assert.equal(refunded.refunded_at, 5000);
});

test("换号：旧卡密留在订单上但买家看不到，新卡密从库存里取", () => {
  const p = product(3);
  const o = buy(p, 2);
  assert.throws(() => replaceCard(o.no, 1, "没付款"), /已发货/);

  fulfillOrder(o.no, { amountCents: 2000, tradeNo: "T7" });
  const [first, second] = orderCardRows(o);
  replaceCard(o.no, first.id, `  ${"封".repeat(300)}  `, 7000);

  const rows = orderCardRows(o);
  assert.equal(rows.length, 3, "旧的那张还挂在订单上");
  assert.equal(rows[0].replaced_at, 7000);
  assert.equal(rows[0].replace_note, "封".repeat(200));
  assert.equal(rows[1].replaced_at, null);
  assert.equal(rows[2].replaced_at, null);
  assert.deepEqual(orderCards(getOrder(o.no)!), [second.content, rows[2].content]);
  assert.equal(getProduct(p)!.stock, 0, "新卡密从库存里扣，旧卡密不回库存");
  assert.equal(getProduct(p)!.sold, 2, "换号不改销量");

  assert.throws(() => replaceCard(o.no, first.id, "又坏了"), /已经换过/);
  assert.throws(() => replaceCard(o.no, second.id, "也坏了"), /库存不足，先补货再换号/);
  assert.equal(orderCardRows(o)[1].replaced_at, null, "没换成的那张原样不动");

  const other = buy(product(1));
  fulfillOrder(other.no, { amountCents: 1000, tradeNo: "T8" });
  assert.throws(
    () => replaceCard(other.no, second.id, "别人的卡密"),
    /不属于这笔订单/,
  );

  refundOrder(o.no);
  addCards(p, 1);
  assert.throws(() => replaceCard(o.no, second.id, "退款了"), /已发货/);
  assert.equal(getProduct(p)!.stock, 1);
});

test("缓存着的老连接版本落后时，自动补上新表和新列", () => {
  const g = globalThis as { __keylyDb?: DatabaseSync; __keylyDbVersion?: number };
  const current = g.__keylyDb;
  // 一个只有老表结构的库，里面有一笔早先标了退款的订单
  const old = new DatabaseSync(":memory:");
  old.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, no TEXT NOT NULL UNIQUE, product_id INTEGER NOT NULL, product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL, amount_cents INTEGER NOT NULL, email TEXT NOT NULL, status TEXT NOT NULL, channel TEXT NOT NULL,
      trade_no TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, paid_at INTEGER);
    CREATE TABLE cards (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, content TEXT NOT NULL, order_id INTEGER,
      created_at INTEGER NOT NULL, UNIQUE (product_id, content));
    INSERT INTO products (name, price_cents, created_at) VALUES ('老商品', 1000, 0);
    INSERT INTO orders (no, product_id, product_name, quantity, amount_cents, email, status, channel, created_at, expires_at, paid_at)
      VALUES ('OLD1', 1, '老商品', 1, 1000, 'a@b.co', 'refunded', 'mock', 1, 2, 3);
    INSERT INTO cards (product_id, content, order_id, created_at) VALUES (1, 'OLD-CARD', 1, 0);
    -- 加站外收入之前的 expenses 表：kind 的约束里只有六种类型
    CREATE TABLE expenses (id INTEGER PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('purchase','supplier_refund','ads','infra','fee','other')),
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      paid_by TEXT NOT NULL DEFAULT 'account' CHECK (paid_by IN ('account','a','b')),
      from_reserve INTEGER NOT NULL DEFAULT 0 CHECK (from_reserve IN (0, 1)),
      note TEXT NOT NULL DEFAULT '', product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      quantity INTEGER, happened_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX expenses_time ON expenses(happened_at);
    INSERT INTO expenses (id, kind, amount_cents, paid_by, from_reserve, note, product_id, quantity, happened_at, created_at)
      VALUES (7, 'purchase', 1234, 'b', 1, '老的一笔进货', 1, 3, 111, 222);
  `);
  g.__keylyDb = old;
  g.__keylyDbVersion = 1;
  try {
    assert.equal(db(), old, "不重新开连接");
    const o = getOrder("OLD1")!;
    assert.equal(o.source, "");
    assert.equal(getProduct(1)!.buy_url, "", "老商品补上付款链接这一列，默认不填");
    assert.equal(o.refunded_at, 3, "老的退款订单按付款时间补上退款时间");
    // 上一次补完列还没填退款时间就中断了：下次启动要接着填上
    old.exec(`UPDATE orders SET refunded_at = NULL`);
    g.__keylyDbVersion = 1;
    assert.equal(getOrder("OLD1")!.refunded_at, 3);
    assert.deepEqual({ ...orderCardRows(o)[0] }, {
      id: 1,
      content: "OLD-CARD",
      replaced_at: null,
      replace_note: "",
    });
    assert.equal(get<{ value: string }>(`SELECT value FROM settings WHERE key = 'share_b'`)!.value, "55");
    assert.equal(get<{ value: string }>(`SELECT value FROM settings WHERE key = 'holder'`)!.value, "");
    // expenses 表为了放宽 kind 的约束重建过：老数据一列不差，新类型能记，乱填的照样不收
    assert.deepEqual({ ...get<Record<string, unknown>>(`SELECT * FROM expenses`)! }, {
      id: 7,
      kind: "purchase",
      amount_cents: 1234,
      paid_by: "b",
      from_reserve: 1,
      note: "老的一笔进货",
      product_id: 1,
      quantity: 3,
      happened_at: 111,
      created_at: 222,
    });
    run(
      `INSERT INTO expenses (kind, amount_cents, happened_at, created_at) VALUES ('offsite_income', 1, 0, 0)`,
    );
    assert.throws(() =>
      run(`INSERT INTO expenses (kind, amount_cents, happened_at, created_at) VALUES ('nonsense', 1, 0, 0)`),
    );
    assert.equal(get<{ n: number }>(`SELECT COUNT(*) AS n FROM expenses`)!.n, 2);
    assert.ok(
      get(`SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'expenses_time'`),
      "索引跟着新表重建",
    );
    assert.equal(
      get(`SELECT 1 FROM sqlite_master WHERE name = 'expenses_new'`),
      undefined,
      "不留下临时表",
    );
    // 再迁移一遍什么都不动
    g.__keylyDbVersion = 1;
    assert.equal(get<{ n: number }>(`SELECT COUNT(*) AS n FROM expenses`)!.n, 2);
    assert.equal(get<{ n: number }>(`SELECT COUNT(*) AS n FROM settlements`)!.n, 0);
  } finally {
    g.__keylyDb = current;
  }
});
