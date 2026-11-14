// 每周对账算法的自检：npm test。金额都是「分」。
import { test } from "node:test";
import assert from "node:assert/strict";
import { settle, WEEK_MS, weekStart } from "./settle.ts";
import type { SettleInput } from "./settle.ts";

type Expense = SettleInput["expenses"][number];

/** 一笔开支，默认从收款账户付、不从准备金出 */
const cost = (
  kind: Expense["kind"],
  amountCents: number,
  over: Partial<Expense> = {},
): Expense => ({ kind, amountCents, paidBy: "account", fromReserve: false, ...over });

const NOTHING = { reserveCents: 0, floatCents: 0, carryCents: 0 };

/** 一周的输入。默认没有任何结余、挂名人没定、乙拿 55%、准备金上限按保底 2000 元算 */
const week = (over: Partial<SettleInput>): SettleInput => ({
  paymentsCents: 0,
  refundsCents: 0,
  expenses: [],
  last30PaymentsCents: 0,
  prev: NOTHING,
  shareB: 55,
  holder: "",
  ...over,
});

test("一周从北京时间周一 0 点开始", () => {
  const monday = Date.parse("2026-11-09T00:00:00+08:00");
  assert.equal(weekStart(Date.parse("2026-11-13T15:00:00+08:00")), monday);
  assert.equal(weekStart(monday), monday);
  assert.equal(weekStart(monday - 1), monday - WEEK_MS, "周日最后一毫秒还算上一周");
  assert.equal(weekStart(monday + WEEK_MS - 1), monday);
  // 北京时间周一早上 7 点，按 UTC 还是周日
  assert.equal(weekStart(Date.parse("2026-11-08T23:00:00Z")), monday);
});

test("约定里的例子", () => {
  // 约定里说明了：周转金只在开头留一次，留够以后每周照表里这样分。所以这里的期初周转金是留够的。
  const r = settle(
    week({
      paymentsCents: 3000000,
      refundsCents: 150000,
      expenses: [
        cost("fee", 90000),
        cost("purchase", 2060000),
        cost("ads", 150000),
        cost("infra", 70000),
      ],
      last30PaymentsCents: 3000000,
      holder: "a",
      prev: { ...NOTHING, floatCents: 2060000 },
    }),
  );
  assert.equal(r.floatTargetCents, 2060000);
  assert.equal(r.floatCents, 2060000);
  assert.equal(r.holderFeeCents, 28500);
  assert.equal(r.purchasesCents, 2060000);
  assert.equal(r.otherExpensesCents, 310000);
  assert.equal(r.profitCents, 451500);
  assert.equal(r.baseCents, 451500);
  assert.equal(r.reserveCapCents, 450000);
  assert.equal(r.reserveAddCents, 90300);
  assert.equal(r.reserveCents, 90300);
  assert.equal(r.floatChangeCents, 0);
  assert.equal(r.payoutCents, 361200);
  assert.equal(r.shareBCents, 198660);
  assert.equal(r.shareACents, 162540);
  assert.equal(r.carryCents, 0);
});

test("亏损结转到下一周，补平之后才分钱；亏损的周也照付挂名补偿", () => {
  const w1 = settle(
    week({ paymentsCents: 100000, expenses: [cost("ads", 300000)], holder: "a" }),
  );
  assert.equal(w1.holderFeeCents, 1000);
  assert.equal(w1.profitCents, -201000);
  assert.equal(w1.carryCents, -201000);
  assert.equal(w1.reserveAddCents, 0);
  assert.equal(w1.payoutCents, 0);
  assert.equal(w1.shareACents, 0);
  assert.equal(w1.shareBCents, 0);

  // 第二周赚了，但不够补上周的亏损：还是什么都不动，剩下的亏损接着往后留
  const w2 = settle(week({ paymentsCents: 100000, holder: "a", prev: w1 }));
  assert.equal(w2.profitCents, 99000);
  assert.equal(w2.baseCents, -102000);
  assert.equal(w2.carryCents, -102000);
  assert.equal(w2.reserveAddCents, 0);
  assert.equal(w2.payoutCents, 0);

  const w3 = settle(week({ paymentsCents: 600000, holder: "a", prev: w2 }));
  assert.equal(w3.profitCents, 594000);
  assert.equal(w3.baseCents, 492000);
  assert.equal(w3.carryCents, 0, "补平后结转清零");
  assert.equal(w3.reserveAddCents, 98400);
  assert.equal(w3.payoutCents, 393600);
  assert.equal(w3.shareBCents, 216480);
  assert.equal(w3.shareACents, 177120);
});

test("准备金最多补到上限，上限不到 2000 元按 2000 元算", () => {
  // 最近 30 天付款 10000 元，15% 是 1500 元，不到保底
  const near = settle(
    week({
      paymentsCents: 500000,
      last30PaymentsCents: 1000000,
      prev: { ...NOTHING, reserveCents: 190000 },
    }),
  );
  assert.equal(near.reserveCapCents, 200000);
  assert.equal(near.reserveAddCents, 10000, "20% 是 1000 元，但离上限只差 100 元");
  assert.equal(near.reserveCents, 200000);
  assert.equal(near.payoutCents, 490000);

  const full = settle(
    week({ paymentsCents: 500000, prev: { ...NOTHING, reserveCents: 250000 } }),
  );
  assert.equal(full.reserveAddCents, 0);
  assert.equal(full.reserveCents, 250000, "已经超过上限时不再留，也不往外拿");
  assert.equal(full.payoutCents, 500000);

  assert.equal(
    settle(week({ last30PaymentsCents: 4000000 })).reserveCapCents,
    600000,
  );
});

test("周转金：按这一周的进货款留，不够就补，钱不够只补一部分，多了放回来分", () => {
  const big = { paymentsCents: 1000000, last30PaymentsCents: 10000000 };

  // 进货 3000 元，利润 7000 元，准备金留 1400 元；周转金从 1000 元补到 3000 元
  const topUp = settle(
    week({
      ...big,
      expenses: [cost("purchase", 300000)],
      prev: { ...NOTHING, floatCents: 100000 },
    }),
  );
  assert.equal(topUp.reserveAddCents, 140000);
  assert.equal(topUp.floatTargetCents, 300000);
  assert.equal(topUp.floatChangeCents, 200000);
  assert.equal(topUp.floatCents, 300000);
  assert.equal(topUp.payoutCents, 360000);

  // 第一周：进货 8000 元，利润 2000 元，留完准备金剩 1600 元，全进周转金，这一周不分钱
  const short = settle(week({ ...big, expenses: [cost("purchase", 800000)] }));
  assert.equal(short.floatTargetCents, 800000);
  assert.equal(short.floatChangeCents, 160000, "留完准备金只剩 1600 元");
  assert.equal(short.floatCents, 160000);
  assert.equal(short.payoutCents, 0);

  // 进货少了：周转金多出来的 2000 元放回来一起分
  const release = settle(
    week({
      ...big,
      expenses: [cost("purchase", 100000)],
      prev: { ...NOTHING, floatCents: 300000 },
    }),
  );
  assert.equal(release.floatChangeCents, -200000);
  assert.equal(release.floatCents, 100000);
  assert.equal(release.payoutCents, 920000, "利润 9000 元减准备金 1800 元，加放回的 2000 元");

  // 上游赔的比进的货还多：目标按 0 算，周转金全部放回
  const negative = settle(
    week({
      ...big,
      expenses: [cost("supplier_refund", 30000)],
      prev: { ...NOTHING, floatCents: 50000 },
    }),
  );
  assert.equal(negative.floatTargetCents, 0);
  assert.equal(negative.floatCents, 0);

  // 亏损的周不动周转金，哪怕它比目标多
  const loss = settle(
    week({ expenses: [cost("ads", 1000)], prev: { ...NOTHING, floatCents: 300000 } }),
  );
  assert.equal(loss.floatChangeCents, 0);
  assert.equal(loss.floatCents, 300000);
});

// 下面几道题的答案是对着约定原文用纸笔算的，没有看算法的写法。
test("手算题：第一周，甲乙各垫了钱，利润不够把周转金留满", () => {
  const r = settle(
    week({
      paymentsCents: 600000,
      expenses: [
        cost("purchase", 500000, { paidBy: "b" }),
        cost("ads", 20000, { paidBy: "a" }),
        cost("fee", 3600),
      ],
      last30PaymentsCents: 600000,
      holder: "b",
    }),
  );
  assert.equal(r.holderFeeCents, 6000);
  assert.equal(r.profitCents, 70400, "6000 − 5000 − 236 − 60");
  assert.equal(r.reserveCapCents, 200000, "15% 只有 900 元，按保底 2000 元");
  assert.equal(r.reserveAddCents, 14080);
  assert.equal(r.floatChangeCents, 56320, "要留 5000 元，手上只剩 563.20 元");
  assert.equal(r.payoutCents, 0);
  assert.equal(r.shareACents + r.shareBCents, 0);
  assert.equal(r.advanceACents, 20000);
  assert.equal(r.advanceBCents, 500000);
  assert.equal(r.carryCents, 0);
});

test("手算题：亏了一周，下一周补平后先留准备金、再留周转金", () => {
  const w1 = settle(
    week({
      paymentsCents: 100000,
      refundsCents: 30000,
      expenses: [cost("purchase", 90000)],
      last30PaymentsCents: 100000,
      holder: "a",
    }),
  );
  assert.equal(w1.holderFeeCents, 700);
  assert.equal(w1.profitCents, -20700);
  assert.equal(w1.floatCents, 0, "亏损的周不留周转金");
  assert.equal(w1.carryCents, -20700);

  const w2 = settle(
    week({
      paymentsCents: 400000,
      expenses: [cost("purchase", 250000)],
      last30PaymentsCents: 500000,
      holder: "a",
      prev: w1,
    }),
  );
  assert.equal(w2.profitCents, 146000);
  assert.equal(w2.baseCents, 125300);
  assert.equal(w2.reserveAddCents, 25060);
  assert.equal(w2.floatChangeCents, 100240);
  assert.equal(w2.payoutCents, 0);
  assert.equal(w2.carryCents, 0);
});

test("手算题：准备金快满、周转金放回、乙 45%、挂名人没定、有零头", () => {
  const r = settle(
    week({
      paymentsCents: 1000001,
      expenses: [
        cost("purchase", 300000),
        cost("supplier_refund", 50000),
        cost("ads", 33333, { paidBy: "a" }),
      ],
      last30PaymentsCents: 2000000,
      prev: { reserveCents: 290000, floatCents: 400000, carryCents: 0 },
      shareB: 45,
    }),
  );
  assert.equal(r.holderFeeCents, 0);
  assert.equal(r.purchasesCents, 250000);
  assert.equal(r.profitCents, 716668);
  assert.equal(r.reserveCapCents, 300000);
  assert.equal(r.reserveAddCents, 10000, "20% 是 1433.34 元，离上限只差 100 元");
  assert.equal(r.reserveCents, 300000);
  assert.equal(r.floatChangeCents, -150000);
  assert.equal(r.floatCents, 250000);
  assert.equal(r.payoutCents, 856668);
  assert.equal(r.shareBCents, 385501, "45% 是 385500.6 分，进成 385501");
  assert.equal(r.shareACents, 471167);
  assert.equal(r.advanceACents, 33333);
});

test("手算题：大面积封号的补货从准备金出，乙先垫的；准备金不够时记成负数", () => {
  const r = settle(
    week({
      paymentsCents: 200000,
      expenses: [
        cost("purchase", 80000),
        cost("purchase", 150000, { paidBy: "b", fromReserve: true }),
      ],
      last30PaymentsCents: 200000,
      prev: { reserveCents: 100000, floatCents: 80000, carryCents: 0 },
      holder: "b",
    }),
  );
  assert.equal(r.holderFeeCents, 2000);
  assert.equal(r.purchasesCents, 80000, "从准备金出的那笔不进利润");
  assert.equal(r.reserveSpentCents, 150000);
  assert.equal(r.profitCents, 118000);
  assert.equal(r.reserveAddCents, 23600);
  assert.equal(r.reserveCents, -26400, "1000 − 1500 + 236");
  assert.equal(r.floatChangeCents, 0);
  assert.equal(r.payoutCents, 94400);
  assert.equal(r.shareBCents, 51920);
  assert.equal(r.shareACents, 42480);
  assert.equal(r.advanceBCents, 150000);
});

test("手算题：各项都带零头", () => {
  const r = settle(
    week({
      paymentsCents: 333333,
      refundsCents: 3333,
      expenses: [cost("purchase", 123457), cost("fee", 2001)],
      last30PaymentsCents: 1500000,
      prev: { reserveCents: 220000, floatCents: 100000, carryCents: -1111 },
      holder: "a",
    }),
  );
  assert.equal(r.holderFeeCents, 3300);
  assert.equal(r.profitCents, 201242);
  assert.equal(r.baseCents, 200131);
  assert.equal(r.reserveCapCents, 225000);
  assert.equal(r.reserveAddCents, 5000);
  assert.equal(r.floatChangeCents, 23457);
  assert.equal(r.floatCents, 123457);
  assert.equal(r.payoutCents, 171674);
  assert.equal(r.shareBCents, 94421, "55% 是 94420.7 分");
  assert.equal(r.shareACents, 77253);
});

test("从准备金出的开支不进利润，只减准备金；余额可以是负数，以后补回来", () => {
  const r = settle(
    week({
      paymentsCents: 500000,
      expenses: [cost("other", 150000, { fromReserve: true })],
      prev: { ...NOTHING, reserveCents: 100000 },
    }),
  );
  assert.equal(r.reserveSpentCents, 150000);
  assert.equal(r.otherExpensesCents, 0);
  assert.equal(r.profitCents, 500000);
  assert.equal(r.reserveAddCents, 100000, "期初 1000 元减 1500 元是负 500 元，离上限差 2500 元");
  assert.equal(r.reserveCents, 50000);
  assert.equal(r.payoutCents, 400000);

  // 没钱赚的周，准备金照样被花掉
  const w1 = settle(week({ expenses: [cost("purchase", 30000, { fromReserve: true })] }));
  assert.equal(w1.purchasesCents, 0);
  assert.equal(w1.profitCents, 0);
  assert.equal(w1.reserveCents, -30000);
  assert.equal(w1.carryCents, 0);
  assert.equal(w1.payoutCents, 0);

  const w2 = settle(week({ paymentsCents: 100000, prev: w1 }));
  assert.equal(w2.reserveAddCents, 20000);
  assert.equal(w2.reserveCents, -10000);
});

test("甲乙垫的钱原数归还，不影响利润；上游赔偿冲减进货款", () => {
  const expenses = [
    cost("ads", 50000, { paidBy: "a" }),
    cost("purchase", 200000, { paidBy: "b" }),
    cost("supplier_refund", 30000),
    cost("fee", 10000),
    cost("infra", 20000, { paidBy: "a", fromReserve: true }),
  ];
  const r = settle(week({ paymentsCents: 1000000, expenses }));
  assert.equal(r.advanceACents, 70000);
  assert.equal(r.advanceBCents, 200000);
  assert.equal(r.purchasesCents, 170000);
  assert.equal(r.otherExpensesCents, 60000);
  assert.equal(r.reserveSpentCents, 20000);
  assert.equal(r.profitCents, 770000);

  const allFromAccount = settle(
    week({
      paymentsCents: 1000000,
      expenses: expenses.map((e) => ({ ...e, paidBy: "account" as const })),
    }),
  );
  assert.equal(allFromAccount.profitCents, r.profitCents);
  assert.equal(allFromAccount.payoutCents, r.payoutCents);
  assert.equal(allFromAccount.advanceACents, 0);
  assert.equal(allFromAccount.advanceBCents, 0);
});

test("挂名人没定不计补偿；净收款是负数时补偿按 0；乙的份额四舍五入到分", () => {
  const sales = { paymentsCents: 200000, refundsCents: 50000 };
  assert.equal(settle(week(sales)).holderFeeCents, 0);
  assert.equal(settle(week(sales)).profitCents, 150000);
  assert.equal(settle(week({ ...sales, holder: "b" })).holderFeeCents, 1500);
  assert.equal(settle(week({ ...sales, holder: "b" })).profitCents, 148500);
  assert.equal(
    settle(week({ refundsCents: 10000, holder: "a" })).holderFeeCents,
    0,
  );

  // 留满准备金后可以分 1.01 元：乙 55% 是 55.55 分，进成 56 分
  const odd = settle(
    week({ paymentsCents: 101, prev: { ...NOTHING, reserveCents: 200000 } }),
  );
  assert.equal(odd.payoutCents, 101);
  assert.equal(odd.shareBCents, 56);
  assert.equal(odd.shareACents, 45);
});
