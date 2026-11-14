import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteCode, generateCodes } from "@/app/admin/actions";
import { ActionForm } from "@/components/action-form";
import { Empty, PageTitle, Panel, Pill } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { Field } from "@/components/form-bits";
import { ButtonCopy } from "@/components/ruixen/button-copy";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { fmtTime } from "@/lib/site";

export const metadata = { title: "兑换码" };

export default function Page({ searchParams }: PageProps<"/admin/codes">) {
  return (
    <>
      <PageTitle
        title="兑换码"
        desc="一个码换一条卡密。适合在别的渠道卖出后，让买家到店铺的「兑换」页自己取货。"
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Codes searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type Row = { code: string; product: string; order_no: string | null; created_at: number };

async function Codes({ searchParams }: Pick<PageProps<"/admin/codes">, "searchParams">) {
  await requireAdmin();
  const { p } = await searchParams;
  await io();

  const pid = typeof p === "string" && /^\d{1,9}$/.test(p) ? Number(p) : 0;
  const products = all<{ id: number; name: string }>(
    `SELECT id, name FROM products ORDER BY id DESC`,
  );
  // ponytail: 只列最近 300 个；要导出全部时再加
  const codes = all<Row>(
    `SELECT r.code, p.name AS product, o.no AS order_no, r.created_at
     FROM redeem_codes r
     JOIN products p ON p.id = r.product_id
     LEFT JOIN orders o ON o.id = r.order_id
     ${pid ? "WHERE r.product_id = ?" : ""}
     ORDER BY r.created_at DESC, r.code LIMIT 300`,
    ...(pid ? [pid] : []),
  );
  const unused = codes.filter((c) => !c.order_no).map((c) => c.code);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
      <Panel title="生成兑换码">
        {products.length === 0 ? (
          <Empty>先去建一件商品。</Empty>
        ) : (
          <ActionForm action={generateCodes} submit="生成" size="lg">
            <div className="space-y-1.5">
              <Label htmlFor="productId">兑换哪件商品</Label>
              <select
                id="productId"
                name="productId"
                defaultValue={pid || products[0].id}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {products.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label="数量"
              name="count"
              type="number"
              min={1}
              max={300}
              defaultValue={10}
              required
              hint="兑换时从这件商品的库存里取卡密，库存不能少于还没兑换的码数。"
            />
          </ActionForm>
        )}
      </Panel>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <form action="/admin/codes" className="flex min-w-0 gap-2">
            <select
              name="p"
              defaultValue={pid || ""}
              aria-label="按商品筛选"
              className="h-9 max-w-56 min-w-0 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">全部商品</option>
              {products.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="lg">
              筛选
            </Button>
          </form>
          {unused.length > 0 && (
            <ButtonCopy
              value={unused.join("\n")}
              label={`复制未使用的 ${unused.length} 个`}
              copiedLabel="已复制"
              sound={false}
            />
          )}
        </div>

        {codes.length === 0 ? (
          <Empty>还没有兑换码。</Empty>
        ) : (
          <Panel className="p-2 sm:p-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>兑换码</TableHead>
                  <TableHead>商品</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">生成时间</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => (
                  <TableRow key={c.code}>
                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                    <TableCell className="max-w-56 truncate">{c.product}</TableCell>
                    <TableCell>
                      {c.order_no ? (
                        <Link href={`/admin/orders/${c.order_no}`} className="hover:text-link">
                          <Pill className="bg-muted text-muted-foreground">已使用 · 看订单</Pill>
                        </Link>
                      ) : (
                        <Pill className="bg-emerald-100 text-emerald-800">未使用</Pill>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {fmtTime(c.created_at)}
                    </TableCell>
                    <TableCell className="w-10">
                      {!c.order_no && (
                        <ActionForm
                          action={deleteCode}
                          submit={<Trash2 aria-label="删除这个兑换码" />}
                          variant="ghost"
                          size="icon-sm"
                          className="space-y-0"
                          buttonClassName="text-muted-foreground hover:text-destructive"
                        >
                          <input type="hidden" name="code" value={c.code} />
                        </ActionForm>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        )}
      </div>
    </div>
  );
}
