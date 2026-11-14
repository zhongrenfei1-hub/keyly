import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { Plus } from "lucide-react";
import { toggleProduct } from "@/app/admin/actions";
import { ActionForm } from "@/components/action-form";
import { Empty, PageTitle, Panel, Pill } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { buttonClass } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/guard";
import { listProducts, outOfStock } from "@/lib/shop";
import { yuan } from "@/lib/site";

export const metadata = { title: "商品" };

export default function Page() {
  return (
    <>
      <PageTitle title="商品" desc="库存就是还没卖出的卡密数，点「管理」进去导入。">
        <Link href="/admin/products/new" className={buttonClass({ size: "lg" })}>
          <Plus />
          新建商品
        </Link>
      </PageTitle>
      <Suspense fallback={<Skeleton className="h-72" />}>
        <List />
      </Suspense>
    </>
  );
}

async function List() {
  await requireAdmin();
  await io();
  const products = listProducts({ includeInactive: true });
  if (products.length === 0)
    return <Empty>还没有商品。先点右上角「新建商品」。</Empty>;

  return (
    <Panel className="p-2 sm:p-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>商品</TableHead>
            <TableHead className="text-right">价格</TableHead>
            <TableHead className="text-right">库存</TableHead>
            <TableHead className="text-right">已售</TableHead>
            <TableHead>状态</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                <Link href={`/admin/products/${p.id}`} className="font-medium hover:text-link">
                  {p.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {p.category || "未分类"}
                  {p.buy_url && " · 站外付款"}
                </p>
              </TableCell>
              <TableCell className="text-right tabular-nums">{yuan(p.price_cents)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {/* 标红的规则和概览待办是同一条（outOfStock）：站外付款的商品没有卡密一般不算缺货 */}
                {outOfStock(p) ? <span className="text-destructive">0</span> : p.stock}
              </TableCell>
              <TableCell className="text-right tabular-nums">{p.sold}</TableCell>
              <TableCell>
                {p.active ? (
                  <Pill className="bg-emerald-100 text-emerald-800">上架中</Pill>
                ) : (
                  <Pill className="bg-muted text-muted-foreground">已下架</Pill>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <ActionForm
                    action={toggleProduct}
                    submit={p.active ? "下架" : "上架"}
                    variant="outline"
                    size="sm"
                    className="space-y-0"
                  >
                    <input type="hidden" name="id" value={p.id} />
                  </ActionForm>
                  <Link
                    href={`/admin/products/${p.id}`}
                    className={buttonClass({ variant: "outline", size: "sm" })}
                  >
                    管理
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}
