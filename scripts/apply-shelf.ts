// 把报价单写进已经有货的库：旧的示例商品下架，报价单里没有的不重复插入。
import { all, get, run, tx } from "../src/lib/db.ts";
import { SHELF } from "../src/lib/shelf.ts";
import { randomCode } from "../src/lib/shop.ts";

const NOTE = "\n\n演示库存，卡密是假的。正式货请在后台替换。";
const names = new Set(SHELF.map((s) => s.name));
const now = Date.now();

tx(() => {
  const current = all<{ id: number; name: string }>(`SELECT id, name FROM products WHERE active = 1`);
  for (const row of current) {
    if (!names.has(row.name)) run(`UPDATE products SET active = 0 WHERE id = ?`, row.id);
  }
  for (const s of [...SHELF].reverse()) {
    const existing = get<{ id: number }>(`SELECT id FROM products WHERE name = ?`, s.name);
    if (existing) {
      run(
        `UPDATE products SET category = ?, description = ?, price_cents = ?, active = 1 WHERE id = ?`,
        s.category,
        s.description + NOTE,
        s.cents,
        existing.id,
      );
      continue;
    }
    const id = Number(
      run(
        `INSERT INTO products (name, category, description, price_cents, created_at) VALUES (?, ?, ?, ?, ?)`,
        s.name,
        s.category,
        s.description + NOTE,
        s.cents,
        now,
      ).lastInsertRowid,
    );
    for (let i = 0; i < 6; i++)
      run(
        `INSERT INTO cards (product_id, content, created_at) VALUES (?, ?, ?)`,
        id,
        `DEMO-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`,
        now,
      );
  }
});

const n = get<{ n: number }>(`SELECT COUNT(*) AS n FROM products WHERE active = 1`)!.n;
console.log(`在售 ${n} 件。`);
