"use server";

// 后台的 Server Action。除了登录和退出，每一个的第一行都是 requireAdmin()。
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/action-form";
import { all, get, run, tx } from "@/lib/db";
import {
  checkAdminPassword,
  requireAdmin,
  signInAdmin,
  signOutAdmin,
  throttle,
} from "@/lib/guard";
import { weekStart } from "@/lib/settle";
import {
  archiveWeek,
  dayKey,
  EARLIEST_DAY,
  expenseBlock,
  KIND_LABEL,
  parseDay,
  PAYER_LABEL,
} from "@/lib/settle-data";
import {
  cleanBuyUrl,
  fulfillOrder,
  getOrder,
  randomCode,
  refundOrder,
  replaceCard,
  retryDelivery,
  ShopError,
} from "@/lib/shop";
import { yuan } from "@/lib/site";

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** 取一个正整数字段，不合法返回 0 */
const int = (form: FormData, name: string) => {
  const s = text(form, name);
  return /^\d{1,9}$/.test(s) ? Number(s) : 0;
};

const MAX_CENTS = 100_000_000; // 单笔收支记录最多 100 万元

/** 取一个金额字段（元），换成分。只认最多两位小数的普通写法；不合法、不大于 0 或超过 100 万元时返回 0 */
const cents = (form: FormData, name: string) => {
  const s = text(form, name);
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return 0;
  const c = Math.round(Number(s) * 100);
  return c >= 1 && c <= MAX_CENTS ? c : 0;
};

function fail(e: unknown): FormState {
  if (e instanceof ShopError) return { error: e.message };
  throw e;
}

// ── 登录 ──────────────────────────────────────────────────

export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (!(await throttle("login", 8, 10)))
    return { error: "尝试次数太多，请 10 分钟后再试" };
  if (!checkAdminPassword(String(form.get("password") ?? "")))
    return { error: "密码不对" };
  await signInAdmin();
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await signOutAdmin();
  redirect("/admin/login");
}

// ── 商品 ──────────────────────────────────────────────────

export async function saveProduct(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = int(form, "id"); // 0 = 新建
  const name = text(form, "name");
  const category = text(form, "category");
  const description = text(form, "description");
  const price = Math.round(Number(text(form, "price")) * 100);
  const active = form.get("active") ? 1 : 0;

  if (!name || name.length > 80) return { error: "商品名称必填，最多 80 个字" };
  if (category.length > 20) return { error: "分类最多 20 个字" };
  if (description.length > 5000) return { error: "商品说明最多 5000 个字" };
  if (!Number.isInteger(price) || price < 1 || price > 10_000_000)
    return { error: "价格要在 0.01 到 100000 元之间" };
  let buyUrl: string;
  try {
    buyUrl = cleanBuyUrl(text(form, "buyUrl"));
  } catch (e) {
    return fail(e);
  }

  if (id) {
    run(
      `UPDATE products SET name = ?, category = ?, description = ?, price_cents = ?, active = ?, buy_url = ? WHERE id = ?`,
      name,
      category,
      description,
      price,
      active,
      buyUrl,
      id,
    );
    refresh();
    return { ok: "已保存" };
  }
  const { lastInsertRowid } = run(
    `INSERT INTO products (name, category, description, price_cents, active, buy_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    name,
    category,
    description,
    price,
    active,
    buyUrl,
    Date.now(),
  );
  redirect(`/admin/products/${lastInsertRowid}`);
}

export async function toggleProduct(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  run(`UPDATE products SET active = 1 - active WHERE id = ?`, int(form, "id"));
  refresh();
  return null;
}

export async function deleteProduct(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = int(form, "id");
  try {
    tx(() => {
      if (get(`SELECT 1 FROM orders WHERE product_id = ? LIMIT 1`, id))
        throw new ShopError("这件商品已经有订单，不能删除，可以改成下架");
      run(`DELETE FROM redeem_codes WHERE product_id = ?`, id);
      run(`DELETE FROM cards WHERE product_id = ?`, id);
      run(`DELETE FROM products WHERE id = ?`, id);
    });
  } catch (e) {
    return fail(e);
  }
  redirect("/admin/products");
}

// ── 卡密库存 ──────────────────────────────────────────────

export async function importCards(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const productId = int(form, "productId");
  const product = get<{ name: string }>(
    `SELECT name FROM products WHERE id = ?`,
    productId,
  );
  if (!product) return { error: "商品不存在" };

  // 进货单价可以不填；填了就在导入后按实际新增的条数记一笔进货开支
  const unitCents = cents(form, "unitPrice");
  if (text(form, "unitPrice") && !unitCents)
    return { error: "进货单价要在 0.01 到 1000000 元之间，最多两位小数；不记开支就留空" };
  const paidBy = text(form, "paidBy") || "account";
  if (!Object.hasOwn(PAYER_LABEL, paidBy)) return { error: "请选择谁付的钱" };

  const lines = [
    ...new Set(
      String(form.get("cards") ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (lines.length === 0) return { error: "请粘贴卡密，一行一条" };
  if (lines.length > 5000 || lines.some((l) => l.length > 2000))
    return { error: "一次最多导入 5000 条，每条最多 2000 个字符" };
  // 和手工记开支一样，一笔进货最多 100 万元。按粘贴的条数算，单价敲错时在导入前就拦住。
  if (lines.length * unitCents > MAX_CENTS)
    return { error: `这批卡密按单价算要 ${yuan(lines.length * unitCents)}，超过了 1000000 元，请检查进货单价，或者分几次导入` };

  const now = Date.now();
  let added = 0;
  let sent = 0;
  tx(() => {
    for (const line of lines)
      added += Number(
        run(
          `INSERT OR IGNORE INTO cards (product_id, content, created_at) VALUES (?, ?, ?)`,
          productId,
          line,
          now,
        ).changes,
      );
    if (unitCents && added > 0)
      run(
        `INSERT INTO expenses (kind, amount_cents, paid_by, note, product_id, quantity, happened_at, created_at)
         VALUES ('purchase', ?, ?, ?, ?, ?, ?, ?)`,
        added * unitCents,
        paidBy,
        `${product.name} ${added} 条`,
        productId,
        added,
        now,
        now,
      );
    // 补货后顺手把「已付款，待发货」的订单发掉，先付款的先发
    const waiting = all<{ no: string }>(
      `SELECT no FROM orders WHERE product_id = ? AND status = 'paid' ORDER BY paid_at`,
      productId,
    );
    for (const { no } of waiting) {
      try {
        retryDelivery(no);
        sent++;
      } catch (e) {
        if (!(e instanceof ShopError)) throw e;
        break; // 库存又不够了，剩下的继续等
      }
    }
  });

  refresh();
  const skipped = lines.length - added;
  return {
    ok:
      `新增 ${added} 条` +
      (skipped ? `，${skipped} 条重复已跳过` : "") +
      (unitCents && added > 0 ? `；已记一笔进货开支 ${yuan(added * unitCents)}` : "") +
      (sent ? `；已给 ${sent} 笔等货的订单补发` : ""),
  };
}

/** 只能删还没卖出、也没被订单锁定的卡密 */
export async function deleteCard(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  run(`DELETE FROM cards WHERE id = ? AND order_id IS NULL`, int(form, "id"));
  refresh();
  return null;
}

export async function clearCards(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const { changes } = run(
    `DELETE FROM cards WHERE product_id = ? AND order_id IS NULL`,
    int(form, "productId"),
  );
  refresh();
  return { ok: `已清空 ${changes} 条未售卡密` };
}

// ── 订单 ──────────────────────────────────────────────────

/** 手动补单：支付通知没到，但确认钱已经收到 */
export async function confirmPaid(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const order = getOrder(text(form, "no"));
  if (!order) return { error: "订单不存在" };
  if (order.status !== "pending" && order.status !== "expired")
    return { error: "这笔订单已经处理过了" };
  try {
    fulfillOrder(order.no, { amountCents: order.amount_cents, tradeNo: "MANUAL" });
  } catch (e) {
    return fail(e);
  }
  refresh();
  return null;
}

export async function redeliver(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    retryDelivery(text(form, "no"));
  } catch (e) {
    return fail(e);
  }
  refresh();
  return null;
}

export async function markRefunded(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  try {
    refundOrder(text(form, "no"));
  } catch (e) {
    return fail(e);
  }
  refresh();
  return null;
}

/** 换号：从库存里取一张新卡密换给买家，旧的那张标成已换 */
export async function swapCard(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const note = text(form, "note");
  if (!note) return { error: "请填一句换号原因" };
  if (note.length > 200) return { error: "换号原因最多 200 个字" };
  try {
    replaceCard(text(form, "no"), int(form, "cardId"), note);
  } catch (e) {
    return fail(e);
  }
  refresh();
  return null;
}

// ── 兑换码 ────────────────────────────────────────────────

export async function generateCodes(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const productId = int(form, "productId");
  const count = int(form, "count");
  if (!get(`SELECT 1 FROM products WHERE id = ?`, productId))
    return { error: "请选择商品" };
  // 上限和兑换码页列表显示的条数一致：一批生成的码都要在页面上看得到、复制得到
  if (count < 1 || count > 300) return { error: "一次生成 1 到 300 个" };

  const now = Date.now();
  tx(() => {
    for (let i = 0; i < count; i++)
      run(
        `INSERT INTO redeem_codes (code, product_id, created_at) VALUES (?, ?, ?)`,
        randomCode(12),
        productId,
        now,
      );
  });
  refresh();
  return { ok: `已生成 ${count} 个兑换码` };
}

/** 只能删还没用过的兑换码 */
export async function deleteCode(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  run(`DELETE FROM redeem_codes WHERE code = ? AND order_id IS NULL`, text(form, "code"));
  refresh();
  return null;
}

// ── 工单 ──────────────────────────────────────────────────

export async function toggleTicket(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  run(
    `UPDATE tickets SET status = CASE status WHEN 'open' THEN 'closed' ELSE 'open' END WHERE id = ?`,
    int(form, "id"),
  );
  refresh();
  return null;
}

// ── 收支 ──────────────────────────────────────────────────

export async function addExpense(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const kind = text(form, "kind");
  const amount = cents(form, "amount");
  const paidBy = text(form, "paidBy");
  const happenedAt = parseDay(text(form, "date"));
  const note = text(form, "note");

  if (!Object.hasOwn(KIND_LABEL, kind)) return { error: "请选择类型" };
  if (!amount) return { error: "金额要在 0.01 到 1000000 元之间，最多两位小数" };
  if (!Object.hasOwn(PAYER_LABEL, paidBy)) return { error: "请选择谁付的钱" };
  if (Number.isNaN(happenedAt)) return { error: "请选择日期" };
  if (happenedAt > Date.now()) return { error: "日期不能晚于今天" };
  if (happenedAt < parseDay(EARLIEST_DAY))
    return { error: `日期太早了，请检查年份。最早只能记到 ${EARLIEST_DAY}` };
  if (note.length > 200) return { error: "备注最多 200 个字" };
  const blocked = expenseBlock(happenedAt);
  if (blocked) return { error: blocked };

  // 站外收入、站外退款记的是合作平台那边收到、退掉的钱，对账时并进买家付款和退款：
  // 一律算收款账户的，也谈不上从准备金出。填错了就明说，不悄悄改掉。
  if (kind === "offsite_income" || kind === "offsite_refund") {
    if (paidBy !== "account")
      return {
        error:
          "站外收入、站外退款一律按收款账户算，「谁付的钱」请选收款账户。合作平台的钱提现到了个人手里的，先转进收款账户再记。",
      };
    if (form.get("fromReserve"))
      return {
        error:
          "站外收入、站外退款不能勾「从准备金出」：它们是并进买家付款和退款算的，请去掉勾选再记。",
      };
  }
  run(
    `INSERT INTO expenses (kind, amount_cents, paid_by, from_reserve, note, happened_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    kind,
    amount,
    paidBy,
    form.get("fromReserve") ? 1 : 0,
    note,
    happenedAt,
    Date.now(),
  );
  refresh();
  // 带上日期：记错周的时候（比如想补上一周却记成了今天）一眼能看出来
  return {
    ok: `已记一笔${KIND_LABEL[kind as keyof typeof KIND_LABEL]} ${yuan(amount)}，日期 ${dayKey(happenedAt)}`,
  };
}

export async function deleteExpense(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const id = int(form, "id");
  const row = get<{ happened_at: number }>(
    `SELECT happened_at FROM expenses WHERE id = ?`,
    id,
  );
  const blocked = row && expenseBlock(row.happened_at);
  if (blocked) return { error: blocked };
  run(`DELETE FROM expenses WHERE id = ?`, id);
  refresh();
  return null;
}

// ── 对账 ──────────────────────────────────────────────────

export async function saveSettings(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const shareB = int(form, "shareB");
  const holder = text(form, "holder");
  if (shareB < 1 || shareB > 99) return { error: "乙的比例要填 1 到 99 之间的整数" };
  if (!["a", "b", ""].includes(holder)) return { error: "请选择收款账户挂在谁名下" };
  run(
    `INSERT OR REPLACE INTO settings (key, value) VALUES ('share_b', ?), ('holder', ?)`,
    String(shareB),
    holder,
  );
  refresh();
  return { ok: "已保存，还没存档的周会按新的设置算" };
}

/** 确认并存档一周的对账单。表单里的 week 是那一周周一的日期，例如 2026-11-09 */
export async function confirmSettlement(_: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const day = parseDay(text(form, "week"));
  if (Number.isNaN(day)) return { error: "没有选中要存档的周" };
  try {
    archiveWeek(weekStart(day));
  } catch (e) {
    return fail(e);
  }
  refresh();
  return null;
}
