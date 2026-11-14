// SQLite 连接、建表、事务。用 Node 自带的 node:sqlite（同步 API），不装数据库。
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

// expenses 表的列，新建和重建（见 rebuildExpenses）共用。
// kind 能填哪些值写在 CHECK 里：前六种是付出去的钱和上游赔偿，
// offsite_income / offsite_refund 是在合作平台收到、退掉的钱，对账时并进买家付款和退款。
const EXPENSES_COLUMNS = `
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('purchase','supplier_refund','ads','infra','fee','other','offsite_income','offsite_refund')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_by TEXT NOT NULL DEFAULT 'account' CHECK (paid_by IN ('account','a','b')),
  from_reserve INTEGER NOT NULL DEFAULT 0 CHECK (from_reserve IN (0, 1)),
  note TEXT NOT NULL DEFAULT '',
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  quantity INTEGER,
  happened_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  buy_url TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  no TEXT NOT NULL UNIQUE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','paid','delivered','expired','refunded')),
  channel TEXT NOT NULL,
  trade_no TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  paid_at INTEGER,
  refunded_at INTEGER,
  source TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS orders_pending ON orders(status, expires_at);
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  content TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  created_at INTEGER NOT NULL,
  replaced_at INTEGER,
  replace_note TEXT NOT NULL DEFAULT '',
  UNIQUE (product_id, content)
);
CREATE INDEX IF NOT EXISTS cards_stock ON cards(product_id, order_id);
CREATE INDEX IF NOT EXISTS cards_order ON cards(order_id);
CREATE TABLE IF NOT EXISTS redeem_codes (
  code TEXT PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  order_id INTEGER REFERENCES orders(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  order_no TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS expenses (${EXPENSES_COLUMNS}
);
CREATE INDEX IF NOT EXISTS expenses_time ON expenses(happened_at);
CREATE TABLE IF NOT EXISTS settlements (
  week_start INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  confirmed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('share_b', '55'), ('holder', '');
`;

// 表结构每改一次就把这个数加一。老数据库靠下面的 migrate 补上新表和新列。
const SCHEMA_VERSION = 6;

// 建表之后才加的列。上面的建表语句里也有，这里是给已经存在的老表补的。
const ADDED_COLUMNS: [table: string, column: string, definition: string][] = [
  ["orders", "refunded_at", "INTEGER"],
  ["orders", "source", "TEXT NOT NULL DEFAULT ''"],
  ["cards", "replaced_at", "INTEGER"],
  ["cards", "replace_note", "TEXT NOT NULL DEFAULT ''"],
  ["products", "buy_url", "TEXT NOT NULL DEFAULT ''"],
  ["users", "provider", "TEXT NOT NULL DEFAULT ''"],
  ["users", "provider_id", "TEXT NOT NULL DEFAULT ''"],
];

/**
 * 老库里 expenses.kind 的 CHECK 不认后来加的类型（站外收入、站外退款）。
 * SQLite 改不了已有表的约束，只能新建一张表把数据搬过去。
 * 搬的时候逐列点名；整个过程在一个事务里，中途出错就原样退回，不会留下半张表。
 */
function rebuildExpenses(d: DatabaseSync): void {
  const outdated = () => {
    const sql = String(
      d.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'expenses'`).get()
        ?.sql ?? "",
    );
    return sql !== "" && !sql.includes("offsite_income");
  };
  if (!outdated()) return;
  const columns =
    "id, kind, amount_cents, paid_by, from_reserve, note, product_id, quantity, happened_at, created_at";
  d.exec("BEGIN IMMEDIATE");
  try {
    // 拿到写锁以后再看一眼：开发服务器会同时起几个进程，别的进程可能刚好重建完了
    if (!outdated()) {
      d.exec("COMMIT");
      return;
    }
    d.exec(`
      CREATE TABLE expenses_new (${EXPENSES_COLUMNS});
      INSERT INTO expenses_new (${columns}) SELECT ${columns} FROM expenses;
      DROP TABLE expenses;
      ALTER TABLE expenses_new RENAME TO expenses;
      CREATE INDEX expenses_time ON expenses(happened_at);
    `);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

/** 建表、补列。可以反复跑，已经有的表和列不会动。 */
function migrate(d: DatabaseSync): void {
  d.exec(SCHEMA);
  rebuildExpenses(d);
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = d.prepare(`PRAGMA table_info(${table})`).all();
    if (columns.some((c) => c.name === column)) continue;
    d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  // 老数据里已退款的订单没记退款时间，按付款时间算，对账时这笔钱一进一出记在同一周。
  // 每次都跑一遍：补完列还没来得及填就中断的库，下次启动能接着填上。
  // 新标的退款一定带退款时间，所以这一句只会碰到老数据。
  d.exec(
    `UPDATE orders SET refunded_at = paid_at WHERE status = 'refunded' AND refunded_at IS NULL`,
  );
}

type Param = string | number | bigint | null;

// 挂在 globalThis 上，开发时热更新不会重复开连接。
// 热更新会换掉这个文件的代码，却不会换掉连接，所以连接旁边记着它的表结构版本，
// 版本落后时重新跑一遍 migrate，不用重启开发服务器。
const g = globalThis as { __keylyDb?: DatabaseSync; __keylyDbVersion?: number };

export function db(): DatabaseSync {
  if (!g.__keylyDb) {
    const file =
      process.env.DATABASE_FILE ?? path.join(process.cwd(), "data", "keyly.db");
    if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
    const d = new DatabaseSync(file);
    d.exec(
      "PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
    );
    g.__keylyDb = d;
    g.__keylyDbVersion = undefined;
  }
  if (g.__keylyDbVersion !== SCHEMA_VERSION) {
    migrate(g.__keylyDb);
    g.__keylyDbVersion = SCHEMA_VERSION;
  }
  return g.__keylyDb;
}

export const all = <T>(sql: string, ...params: Param[]) =>
  db().prepare(sql).all(...params) as T[];

export const get = <T>(sql: string, ...params: Param[]) =>
  db().prepare(sql).get(...params) as T | undefined;

export const run = (sql: string, ...params: Param[]) =>
  db().prepare(sql).run(...params);

let depth = 0;

/** 事务。fn 必须是同步函数（里面不能 await），嵌套调用会并入外层事务。 */
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  const d = db();
  d.exec("BEGIN IMMEDIATE");
  depth++;
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}
