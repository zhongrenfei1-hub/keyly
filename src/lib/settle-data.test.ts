// 对账读库这条线的自检：汇总口径、按顺序存档、存档后只读。npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./db.ts";
import { WEEK_MS, weekStart } from "./settle.ts";
import {
  archiveBlock,
  archiveWeek,
  dayKey,
  expenseBlock,
  weekSources,
  weekView,
} from "./settle-data.ts";
import { ShopError } from "./shop.ts";

// 这份测试会改设置、会存档，只能对着内存库跑。
assert.equal(process.env.DATABASE_FILE, ":memory:", "请用 npm test 运行");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// 2026-11-02 是周一
const W1 = weekStart(Date.parse("2026-11-03T12:00:00+08:00"));
const W2 = W1 + WEEK_MS;
const W3 = W2 + WEEK_MS;

let serial = 0;
function order(cents: number, paidAt: number, extra: { source?: string; refundedAt?: number; channel?: string } = {}) {
  run(
    `INSERT INTO orders (no, product_id, product_name, quantity, amount_cents, email, status, channel, source, created_at, expires_at, paid_at, refunded_at)
     VALUES (?, 1, '测试商品', 1, ?, 'a@b.co', ?, ?, ?, ?, ?, ?, ?)`,
    `T${++serial}`,
    cents,
    extra.refundedAt ? "refunded" : "delivered",
    extra.channel ?? "mock",
    extra.source ?? "",
    paidAt,
    paidAt,
    paidAt,
    extra.refundedAt ?? null,
  );
}

function expense(kind: string, cents: number, at: number, paidBy = "account") {
  run(
    `INSERT INTO expenses (kind, amount_cents, paid_by, happened_at, created_at) VALUES (?, ?, ?, ?, ?)`,
    kind,
    cents,
    paidBy,
    at,
    at,
  );
}

test("从订单和开支汇总，按顺序存档，存档后只读", () => {
  run(`INSERT INTO products (name, price_cents, created_at) VALUES ('测试商品', 1000, 0)`);
  run(`UPDATE settings SET value = 'a' WHERE key = 'holder'`);

  // 周一 0 点整算这一周，下周一 0 点整算下一周
  order(1_850_000, W1, { source: "douyin" });
  order(1_000_000, W2 - 1);
  order(150_000, W1 + HOUR, { source: "douyin", refundedAt: W1 + 2 * HOUR });
  order(0, W1 + HOUR, { channel: "redeem" });
  order(500_000, W2);
  expense("fee", 90_000, W1 + HOUR);
  expense("purchase", 2_100_000, W1 + HOUR);
  expense("supplier_refund", 40_000, W1 + HOUR);
  expense("ads", 150_000, W1 + HOUR, "a");
  expense("infra", 70_000, W1 + HOUR);

  const v = weekView(W1);
  assert.equal(v.confirmedAt, null);
  assert.equal(v.input.paymentsCents, 3_000_000);
  assert.equal(v.input.refundsCents, 150_000);
  assert.equal(v.input.last30PaymentsCents, 3_000_000);
  assert.equal(v.result.holderFeeCents, 28_500);
  assert.equal(v.result.profitCents, 451_500);
  assert.equal(v.result.reserveAddCents, 90_300);
  // 第一周：留完准备金剩下的 3612 元全进周转金（目标是这一周的进货款 20600 元），不分钱
  assert.equal(v.result.floatTargetCents, 2_060_000);
  assert.equal(v.result.floatCents, 361_200);
  assert.equal(v.result.payoutCents, 0);
  assert.equal(v.result.advanceACents, 150_000);
  assert.deepEqual(
    weekSources(W1).map((s) => ({ ...s })),
    [
      { source: "douyin", orders: 2, cents: 2_000_000 },
      { source: "", orders: 1, cents: 1_000_000 },
    ],
    "来源只算付了款的订单，不含兑换码取货",
  );

  // 更早的一周里只有一笔标了退款的兑换订单（金额是 0）：不算「有订单却没存档的周」
  order(0, W1 - WEEK_MS, { channel: "redeem", refundedAt: W1 - WEEK_MS + HOUR });

  const now = W3 + HOUR;
  assert.match(archiveBlock(W1, W2 - 1)!, /还没过完/);
  assert.match(archiveBlock(W2, now)!, /2026-11-02 至 2026-11-08/, "前一周没存档，不能先存这一周");
  assert.equal(expenseBlock(W1 + HOUR), null);

  archiveWeek(W1, now);
  assert.throws(() => archiveWeek(W1, now), ShopError);
  assert.match(expenseBlock(W1 + HOUR)!, /已经存档/);
  assert.equal(expenseBlock(W2), null);

  // 存档以后再改设置、再有新的数据，这一周的数字不变
  run(`UPDATE settings SET value = '60' WHERE key = 'share_b'`);
  expense("ads", 1, W1 + HOUR);
  const saved = weekView(W1);
  assert.equal(saved.confirmedAt, now);
  assert.deepEqual(saved.result, v.result);

  // 上一周的存档就是这一周的期初
  const next = weekView(W2);
  const carried = { reserveCents: 90_300, floatCents: 361_200, carryCents: 0 };
  assert.deepEqual(next.input.prev, carried);
  assert.equal(next.input.shareB, 60);
  assert.equal(archiveBlock(W2, now), null);

  // 中间隔着空周时，准备金、周转金、结转原样带过来
  assert.deepEqual(weekView(W3 + WEEK_MS).input.prev, carried);
});

test("站外收入并进买家付款，站外退款并进退款，不当开支再扣一遍；存档后明细还在", () => {
  run(`UPDATE settings SET value = '55' WHERE key = 'share_b'`);
  run(`UPDATE settings SET value = 'b' WHERE key = 'holder'`);
  // 离上一条测试用到的周足够远
  const W = W1 + 20 * WEEK_MS;
  const end = W + WEEK_MS;
  const EARLIER = W - 4 * WEEK_MS;

  order(30_000, W + HOUR);
  order(5_000, W + HOUR, { refundedAt: W + 2 * HOUR }); // 在本站付了款又退掉的一单
  // 记账页存的时间正好是当天 0 点，日期选周一的记录就落在周的起点上，所以专门卡着边界放
  expense("offsite_income", 100_000, W); // 周一 0 点整，算这一周
  expense("offsite_refund", 8_000, end - 1); // 周日最后一毫秒，算这一周
  expense("offsite_income", 1, end); // 下周一 0 点整，不算这一周
  expense("offsite_refund", 1, end);
  expense("fee", 4_000, W + HOUR);
  expense("purchase", 40_000, W + HOUR);
  // 准备金上限看的「最近 30 天买家付款」：窗口是这一周周末往前 30 天，站外收入一样按日期算
  expense("offsite_income", 25_000, end - 30 * DAY); // 窗口的起点，算在里面
  expense("offsite_income", 7_000, end - 30 * DAY - 1); // 早一毫秒，不算
  assert.equal(weekStart(end - 30 * DAY), EARLIER);
  assert.equal(weekStart(end - 30 * DAY - 1), EARLIER);

  // 手算：买家付款 300 + 50 + 站外 1000 = 1350；退款 50 + 站外 80 = 130；
  // 挂名补偿 (1350 − 130) × 1% = 12.20；利润 1220 − 进货 400 − 手续费 40 − 12.20 = 767.80
  const v = weekView(W);
  assert.equal(v.input.paymentsCents, 135_000);
  assert.equal(v.input.refundsCents, 13_000);
  assert.deepEqual(v.offsite, { incomeCents: 100_000, refundsCents: 8_000 });
  assert.equal(v.input.last30PaymentsCents, 35_000 + 100_000 + 25_000);
  assert.deepEqual(
    v.input.expenses.map((e) => e.kind).sort(),
    ["fee", "purchase"],
    "站外收入和站外退款不交给算法当开支",
  );
  assert.equal(v.result.holderFeeCents, 1_220);
  assert.equal(v.result.purchasesCents, 40_000);
  assert.equal(v.result.otherExpensesCents, 4_000);
  assert.equal(v.result.profitCents, 76_780);
  assert.equal(v.result.advanceACents + v.result.advanceBCents, 0, "站外的钱不算谁垫的");

  // 只有站外收入的一周：买家付款 320，挂名补偿 3.20，利润 316.80
  const e = weekView(EARLIER);
  assert.equal(e.input.paymentsCents, 32_000);
  assert.equal(e.result.profitCents, 31_680);

  // 只记了站外收入的周也算「有记录没存档」，后面的周要等它先存
  const now = end + HOUR;
  archiveWeek(W2, now);
  assert.match(archiveBlock(W, now)!, new RegExp(dayKey(EARLIER)));
  archiveWeek(EARLIER, now);
  archiveWeek(W, now);

  // 存档以后，再往这一周塞站外收入，数字和明细都不变
  expense("offsite_income", 999, W + HOUR);
  const saved = weekView(W);
  assert.equal(saved.confirmedAt, now);
  assert.deepEqual(saved.offsite, v.offsite);
  assert.equal(saved.input.paymentsCents, 135_000);
  assert.equal(saved.result.profitCents, 76_780);
  assert.equal(weekView(end).input.prev.reserveCents, saved.result.reserveCents);

  // 加这一项之前存的档里没有站外明细，读出来按 0 算
  const ANCIENT = W1 - 10 * WEEK_MS;
  run(
    `INSERT INTO settlements (week_start, data, confirmed_at) VALUES (?, ?, 1)`,
    ANCIENT,
    JSON.stringify({ input: v.input, result: v.result }),
  );
  assert.deepEqual(weekView(ANCIENT).offsite, { incomeCents: 0, refundsCents: 0 });
});
