// 对账要读写数据库的部分：把订单和收支记录汇总成一周的输入、读存档、存档。
// 算账本身在 settle.ts。这个文件不依赖 Next，测试可以直接加载。
import { all, get, run, tx } from "./db.ts";
import { settle, WEEK_MS, weekStart } from "./settle.ts";
import type { ExpenseKind, SettleInput, SettleResult } from "./settle.ts";
import { ShopError } from "./shop.ts";

/**
 * 在合作平台（比如链动小铺）收到、退掉的钱。那边的订单不在本站，只能照结算单手工记。
 * 它们和开支记在同一张表里，但不是开支：对账时站外收入并进「买家付款」，站外退款并进「退款」。
 */
export type OffsiteKind = "offsite_income" | "offsite_refund";

/** 收支页能记的全部类型 */
export type LedgerKind = ExpenseKind | OffsiteKind;

const isOffsite = (kind: LedgerKind): kind is OffsiteKind =>
  kind === "offsite_income" || kind === "offsite_refund";

export const KIND_LABEL: Record<LedgerKind, string> = {
  purchase: "进货",
  supplier_refund: "上游赔偿",
  ads: "广告费",
  infra: "服务器和工具",
  fee: "支付手续费",
  other: "其他",
  offsite_income: "站外收入",
  offsite_refund: "站外退款",
};

export const PAYER_LABEL: Record<"account" | "a" | "b", string> = {
  account: "收款账户",
  a: "甲",
  b: "乙",
};

const DAY_MS = 86_400_000;
const TZ_MS = 8 * 3_600_000;

/** 毫秒时间戳 → 北京时间的日期「2026-11-09」 */
export const dayKey = (ms: number) =>
  new Date(ms + TZ_MS).toISOString().slice(0, 10);

/** 「2026-11-09」→ 那天北京时间 0 点的时间戳；格式不对返回 NaN */
export const parseDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00+08:00`) : NaN;

/** 收支记录能记的最早日期。年份敲错（比如敲成 0026）时拦在这里。 */
export const EARLIEST_DAY = "2026-01-01";

/** 一周的起止日期，例如「2026-11-09 至 2026-11-15」 */
export const weekLabel = (week: number) =>
  `${dayKey(week)} 至 ${dayKey(week + WEEK_MS - DAY_MS)}`;

/**
 * 网址里的 w 参数（那一周里任意一天的日期）→ 那一周周一 0 点的时间戳。
 * 没填或格式不对时用 fallback，最晚只到本周。
 */
export function pickWeek(raw: unknown, fallback: number, now = Date.now()): number {
  const day = typeof raw === "string" ? parseDay(raw) : NaN;
  return Math.min(Number.isNaN(day) ? fallback : weekStart(day), weekStart(now));
}

export type Expense = {
  id: number;
  kind: LedgerKind;
  amount_cents: number;
  paid_by: "account" | "a" | "b";
  from_reserve: number;
  note: string;
  product_id: number | null;
  quantity: number | null;
  happened_at: number;
  created_at: number;
};

export const weekExpenses = (week: number) =>
  all<Expense>(
    `SELECT * FROM expenses WHERE happened_at >= ? AND happened_at < ? ORDER BY happened_at DESC, id DESC`,
    week,
    week + WEEK_MS,
  );

/** 乙的比例和收款账户的挂名人。默认值建表时已经写进库里。 */
export function getSettings(): Pick<SettleInput, "shareB" | "holder"> {
  const m = new Map(
    all<{ key: string; value: string }>(`SELECT key, value FROM settings`).map(
      (r) => [r.key, r.value],
    ),
  );
  const holder = m.get("holder");
  return {
    shareB: Number(m.get("share_b")),
    holder: holder === "a" || holder === "b" ? holder : "",
  };
}

// 买家付款的口径：有付款时间就算（之后退款的也算在付款那一周），不含兑换码取货。
const PAID_BETWEEN = `channel <> 'redeem' AND paid_at >= ? AND paid_at < ?`;

const sum = (sql: string, from: number, to: number) =>
  get<{ n: number }>(sql, from, to)!.n;

/** 一段时间里记下的站外收入或站外退款合计 */
const offsiteSum = (kind: OffsiteKind, from: number, to: number) =>
  sum(
    `SELECT COALESCE(SUM(amount_cents), 0) AS n FROM expenses
     WHERE kind = '${kind}' AND happened_at >= ? AND happened_at < ?`,
    from,
    to,
  );

/** 买家付款和退款里，有多少是在合作平台收的、退的。只用于显示，钱已经含在 input 里。 */
type Offsite = { incomeCents: number; refundsCents: number };

/** 存档里的内容。offsite 是后来加的，早先存的档里没有。 */
type Saved = { input: SettleInput; result: SettleResult; offsite?: Offsite };

/**
 * 这一周的期初：它前面最近一份存档留下的数。没有任何存档时全是 0。
 * 最近的存档不是紧挨着的上一周时，中间隔的是没有订单也没有开支的空周，
 * 准备金、周转金、结转原样带过来。
 */
function prevOf(week: number): SettleInput["prev"] {
  const row = get<{ data: string }>(
    `SELECT data FROM settlements WHERE week_start < ? ORDER BY week_start DESC LIMIT 1`,
    week,
  );
  if (!row) return { reserveCents: 0, floatCents: 0, carryCents: 0 };
  const r = (JSON.parse(row.data) as Saved).result;
  return {
    reserveCents: r.reserveCents,
    floatCents: r.floatCents,
    carryCents: r.carryCents,
  };
}

export type WeekView = Required<Saved> & {
  week: number;
  /** 存档时间。不为空表示这一周已经存档，input 和 result 是存档里的数字。 */
  confirmedAt: number | null;
};

/** 一周的对账单。已存档的读存档，没存档的按现在的订单、收支记录和设置现算。 */
export function weekView(week: number): WeekView {
  const saved = get<{ data: string; confirmed_at: number }>(
    `SELECT data, confirmed_at FROM settlements WHERE week_start = ?`,
    week,
  );
  if (saved) {
    const { input, result, offsite } = JSON.parse(saved.data) as Saved;
    return {
      week,
      input,
      result,
      // 加这一项之前存的档里没有它，那时也没有站外收入
      offsite: offsite ?? { incomeCents: 0, refundsCents: 0 },
      confirmedAt: saved.confirmed_at,
    };
  }

  const end = week + WEEK_MS;
  const offsite: Offsite = {
    incomeCents: offsiteSum("offsite_income", week, end),
    refundsCents: offsiteSum("offsite_refund", week, end),
  };
  const input: SettleInput = {
    // 买家付款 = 在本站付款的订单 + 记在收支里的站外收入；退款同理
    paymentsCents:
      sum(
        `SELECT COALESCE(SUM(amount_cents), 0) AS n FROM orders WHERE ${PAID_BETWEEN}`,
        week,
        end,
      ) + offsite.incomeCents,
    refundsCents:
      sum(
        `SELECT COALESCE(SUM(amount_cents), 0) AS n FROM orders WHERE refunded_at >= ? AND refunded_at < ?`,
        week,
        end,
      ) + offsite.refundsCents,
    // 站外收入和站外退款已经算进上面两项了，不是开支，不能再交给算法当开支扣一遍
    expenses: weekExpenses(week).flatMap((e) =>
      isOffsite(e.kind)
        ? []
        : [
            {
              kind: e.kind,
              amountCents: e.amount_cents,
              paidBy: e.paid_by,
              fromReserve: e.from_reserve === 1,
            },
          ],
    ),
    // 准备金上限看最近 30 天的买家付款，站外收入同样算在里面
    last30PaymentsCents:
      sum(
        `SELECT COALESCE(SUM(amount_cents), 0) AS n FROM orders WHERE ${PAID_BETWEEN}`,
        end - 30 * DAY_MS,
        end,
      ) + offsiteSum("offsite_income", end - 30 * DAY_MS, end),
    prev: prevOf(week),
    ...getSettings(),
  };
  return { week, input, result: settle(input), offsite, confirmedAt: null };
}

/** 本周订单来源：只算付了款的订单，不含兑换码取货。 */
export const weekSources = (week: number) =>
  all<{ source: string; orders: number; cents: number }>(
    `SELECT source, COUNT(*) AS orders, SUM(amount_cents) AS cents FROM orders
     WHERE ${PAID_BETWEEN} GROUP BY source ORDER BY cents DESC, source`,
    week,
    week + WEEK_MS,
  );

// 在 SQL 里把时间戳换成它那一周的周一 0 点，算法和 weekStart 一样。
// OFFSET 是 1970 年以前的一个周一，被除数为正时 SQLite 的整数除法才等于向下取整。
// 订单的时间都是当时的时间，收支记录的日期不早于 EARLIEST_DAY（记的时候拦住），所以被除数恒为正。
const OFFSET = weekStart(0);
const weekSql = (column: string) =>
  `((${column} - ${OFFSET}) / ${WEEK_MS} * ${WEEK_MS} + ${OFFSET})`;

/** 这一周之前，最早的一个有订单或收支记录却还没存档的周。没有就返回 null。 */
export function openWeekBefore(week: number): number | null {
  return get<{ w: number | null }>(
    `SELECT MIN(w) AS w FROM (
       SELECT ${weekSql("paid_at")} AS w FROM orders WHERE channel <> 'redeem' AND paid_at < ?
       UNION SELECT ${weekSql("refunded_at")} FROM orders WHERE channel <> 'redeem' AND refunded_at < ?
       UNION SELECT ${weekSql("happened_at")} FROM expenses WHERE happened_at < ?
     ) WHERE w NOT IN (SELECT week_start FROM settlements)`,
    week,
    week,
    week,
  )!.w;
}

const lastArchivedWeek = () =>
  get<{ w: number | null }>(`SELECT MAX(week_start) AS w FROM settlements`)!.w;

const isArchived = (week: number) =>
  get(`SELECT 1 FROM settlements WHERE week_start = ?`, week) !== undefined;

/** 这一周现在能不能存档。能就返回 null，不能就返回给管理员看的原因。 */
export function archiveBlock(week: number, now = Date.now()): string | null {
  if (isArchived(week)) return "这一周已经存档了。";
  if (week + WEEK_MS > now) return "这一周还没过完，过完以后才能存档。";
  const last = lastArchivedWeek();
  if (last !== null && week < last)
    return "后面的周已经存档，这一周没有订单也没有收支记录，不用再存。";
  const open = openWeekBefore(week);
  if (open !== null)
    return `要按顺序存档：${weekLabel(open)} 这一周有订单或收支记录，还没存档，先去存它。`;
  return null;
}

/** 确认并存档：把这一周的输入和结果写进 settlements，之后这一周只读。 */
export function archiveWeek(week: number, now = Date.now()): void {
  tx(() => {
    const reason = archiveBlock(week, now);
    if (reason) throw new ShopError(reason);
    const { input, result, offsite } = weekView(week);
    const saved: Saved = { input, result, offsite };
    run(
      `INSERT INTO settlements (week_start, data, confirmed_at) VALUES (?, ?, ?)`,
      week,
      JSON.stringify(saved),
      now,
    );
  });
}

/**
 * 发生在这个时间点的收支记录现在能不能增删。能就返回 null，不能就返回原因。
 * 已存档的周不能动；排在最后一份存档前面的空周也不能补记，
 * 否则那一周会变成「有收支记录却没存档」，后面的存档就接不上了。
 */
export function expenseBlock(ms: number): string | null {
  const last = lastArchivedWeek();
  if (last === null || ms >= last + WEEK_MS) return null;
  const week = weekStart(ms);
  return isArchived(week)
    ? `${weekLabel(week)} 这一周已经存档，不能再增删收支记录。`
    : `${weekLabel(last)} 这一周已经存档，它之前的周不能再补记或删除收支记录。请记到还没存档的周里，在备注里写明实际日期。`;
}
