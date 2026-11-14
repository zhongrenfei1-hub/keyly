// 往空数据库里放几件示例商品，第一次打开时有东西可看：npm run seed
// 卡密都是 DEMO- 开头的假数据，正式上架前在后台把示例商品删掉。
import { get, run, tx } from "../src/lib/db.ts";
import { SHELF } from "../src/lib/shelf.ts";
import { randomCode } from "../src/lib/shop.ts";

if (get<{ n: number }>(`SELECT COUNT(*) AS n FROM products`)!.n > 0) {
  console.log("数据库里已经有商品，没有改动。");
  process.exit(0);
}

const NOTE = "\n\n演示库存，卡密是假的。正式货请在后台替换。";

const now = Date.now();

tx(() => {
  for (const s of [...SHELF].reverse()) {
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

console.log(`已放入 ${SHELF.length} 件报价单商品。`);
