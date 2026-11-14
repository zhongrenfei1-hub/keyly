// 每周对账的算法。纯函数：不读数据库，不依赖 Next，金额全部是整数「分」。
// 规则来自两位合伙人的书面约定：甲管获客和网站，乙管货源和售后。

export const WEEK_MS = 604800000;

// 1970-01-05 是周一，它的北京时间 0 点是 UTC 的 1970-01-04 16:00。
const FIRST_MONDAY = 4 * 86400000 - 8 * 3600000;

/** 这个时间点所在那一周的周一 0 点（北京时间）的时间戳 */
export function weekStart(ms: number): number {
  return Math.floor((ms - FIRST_MONDAY) / WEEK_MS) * WEEK_MS + FIRST_MONDAY;
}

export type ExpenseKind =
  | "purchase" // 进货款
  | "supplier_refund" // 上游赔偿：供货商赔回来的钱，是收进来的
  | "ads" // 广告费
  | "infra" // 服务器、域名、工具
  | "fee" // 支付手续费
  | "other";

export type SettleInput = {
  /** 本周买家付款 */
  paymentsCents: number;
  /** 本周退款 */
  refundsCents: number;
  /** amountCents 恒为正；supplier_refund 是收进来的钱 */
  expenses: {
    kind: ExpenseKind;
    amountCents: number;
    paidBy: "account" | "a" | "b";
    fromReserve: boolean;
  }[];
  /** 截至本周末最近 30 天的买家付款 */
  last30PaymentsCents: number;
  /** 上一周存档留下的：准备金余额、周转金余额、亏损结转（小于等于 0） */
  prev: {
    reserveCents: number;
    floatCents: number;
    carryCents: number;
  };
  /** 乙的比例，整数百分比 */
  shareB: number;
  /** 收款账户挂在谁名下，空表示还没定 */
  holder: "a" | "b" | "";
};

export type SettleResult = {
  /** 挂名补偿 */
  holderFeeCents: number;
  /** 本周进货款净额（进货减上游赔偿，不含从准备金出的） */
  purchasesCents: number;
  /** 本周其他开支（不含从准备金出的） */
  otherExpensesCents: number;
  /** 本周从准备金出的开支合计 */
  reserveSpentCents: number;
  /** 本周利润 */
  profitCents: number;
  /** 可处理的数（利润加结转） */
  baseCents: number;
  /** 准备金上限 */
  reserveCapCents: number;
  /** 本周留的准备金 */
  reserveAddCents: number;
  /** 期末准备金余额 */
  reserveCents: number;
  /** 周转金目标：这一周的进货款净额，小于 0 时按 0 */
  floatTargetCents: number;
  /** 周转金变化，补为正、放回为负 */
  floatChangeCents: number;
  /** 期末周转金余额 */
  floatCents: number;
  /** 留到下一周的亏损，小于等于 0 */
  carryCents: number;
  /** 可以分的钱 */
  payoutCents: number;
  shareACents: number;
  shareBCents: number;
  /** 要还给甲的垫款 */
  advanceACents: number;
  /** 要还给乙的垫款 */
  advanceBCents: number;
};

const HOLDER_FEE_PERCENT = 1;
const RESERVE_PERCENT = 20;
const RESERVE_CAP_PERCENT = 15;
const RESERVE_CAP_FLOOR_CENTS = 200000;

/** 按百分比取数，四舍五入到分 */
const percent = (cents: number, p: number) => Math.round((cents * p) / 100);

export function settle(input: SettleInput): SettleResult {
  const { paymentsCents, refundsCents, prev } = input;

  let purchasesCents = 0;
  let otherExpensesCents = 0;
  let reserveSpentCents = 0;
  let advanceACents = 0;
  let advanceBCents = 0;
  for (const e of input.expenses) {
    // 上游赔偿是收进来的钱，在它落到的那一栏里记成负数。
    const signed = e.kind === "supplier_refund" ? -e.amountCents : e.amountCents;
    if (e.fromReserve) reserveSpentCents += signed;
    else if (e.kind === "purchase" || e.kind === "supplier_refund")
      purchasesCents += signed;
    else otherExpensesCents += signed;
    // 垫款原数归还，和这笔开支进不进利润公式无关。
    if (e.paidBy === "a") advanceACents += signed;
    if (e.paidBy === "b") advanceBCents += signed;
  }

  const netSalesCents = paymentsCents - refundsCents;
  const holderFeeCents = input.holder
    ? Math.max(0, percent(netSalesCents, HOLDER_FEE_PERCENT))
    : 0;
  const profitCents =
    netSalesCents - purchasesCents - otherExpensesCents - holderFeeCents;
  const baseCents = profitCents + prev.carryCents;

  const reserveCapCents = Math.max(
    RESERVE_CAP_FLOOR_CENTS,
    percent(input.last30PaymentsCents, RESERVE_CAP_PERCENT),
  );
  const reserveOpenCents = prev.reserveCents - reserveSpentCents;
  // 约定第四节第 1 条：周一对账时留够下一周进货用的周转金，数额按刚对完的这一周的进货款定。
  const floatTargetCents = Math.max(0, purchasesCents);

  // 可处理的数不大于 0：不留准备金、不动周转金、不分钱，原样留到下一周。
  let reserveAddCents = 0;
  let floatChangeCents = 0;
  if (baseCents > 0) {
    reserveAddCents = Math.min(
      percent(baseCents, RESERVE_PERCENT),
      Math.max(0, reserveCapCents - reserveOpenCents),
    );
    // 周转金不够就补，最多补到留完准备金剩下的钱为止；多了就把多出的放回来。
    floatChangeCents = Math.min(
      floatTargetCents - prev.floatCents,
      baseCents - reserveAddCents,
    );
  }
  const payoutCents =
    baseCents > 0 ? baseCents - reserveAddCents - floatChangeCents : 0;
  const shareBCents = percent(payoutCents, input.shareB);

  return {
    holderFeeCents,
    purchasesCents,
    otherExpensesCents,
    reserveSpentCents,
    profitCents,
    baseCents,
    reserveCapCents,
    reserveAddCents,
    reserveCents: reserveOpenCents + reserveAddCents,
    floatTargetCents,
    floatChangeCents,
    floatCents: prev.floatCents + floatChangeCents,
    carryCents: Math.min(0, baseCents),
    payoutCents,
    shareACents: payoutCents - shareBCents,
    shareBCents,
    advanceACents,
    advanceBCents,
  };
}
