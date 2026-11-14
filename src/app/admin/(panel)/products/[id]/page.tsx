import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  clearCards,
  deleteCard,
  deleteProduct,
  importCards,
  saveProduct,
} from "@/app/admin/actions";
import { ActionForm } from "@/components/action-form";
import { Empty, Panel } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { Field } from "@/components/form-bits";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { all } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { PAYER_LABEL } from "@/lib/settle-data";
import { getProduct } from "@/lib/shop";

export const metadata = { title: "编辑商品" };

export default function Page({ params }: PageProps<"/admin/products/[id]">) {
  return (
    <>
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        全部商品
      </Link>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}

async function Editor({ params }: Pick<PageProps<"/admin/products/[id]">, "params">) {
  await requireAdmin();
  const { id } = await params;
  await io();

  const p = /^\d+$/.test(id) ? getProduct(Number(id)) : undefined;
  if (id !== "new" && !p) notFound();

  const categories = all<{ category: string }>(
    `SELECT DISTINCT category FROM products WHERE category <> '' ORDER BY category`,
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel title={p ? "基本信息" : "新建商品"}>
        <ActionForm action={saveProduct} submit={p ? "保存" : "创建商品"} size="lg">
          {p && <input type="hidden" name="id" value={p.id} />}
          <Field label="名称" name="name" required maxLength={80} defaultValue={p?.name} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="分类"
              name="category"
              maxLength={20}
              list="categories"
              defaultValue={p?.category}
              placeholder="选一个或直接输入"
            />
            <Field
              label="价格（元）"
              name="price"
              required
              inputMode="decimal"
              defaultValue={p ? (p.price_cents / 100).toFixed(2) : ""}
              placeholder="9.90"
            />
          </div>
          <datalist id="categories">
            {categories.map((c) => (
              <option key={c.category} value={c.category} />
            ))}
          </datalist>
          <div className="space-y-1.5">
            <Label htmlFor="description">商品说明</Label>
            <Textarea
              id="description"
              name="description"
              rows={7}
              maxLength={5000}
              defaultValue={p?.description}
              className="rounded-xl bg-background px-3 py-2.5"
              placeholder="买家在商品页看到的文字：包含什么、怎么用、有效期、注意事项。"
            />
          </div>
          <Field
            label="站外付款链接（可以不填）"
            name="buyUrl"
            type="url"
            maxLength={300}
            defaultValue={p?.buy_url}
            placeholder="https://wzyp.cn/item/……"
            hint="用链动小铺这类平台收款时，把那边商品页的地址贴在这里。贴浏览器地址栏里最终显示的那个，不要贴短链接：买家会看到链接里的域名，跳过去要对得上。"
          />
          <p className="text-xs text-muted-foreground">
            填了以后：商品页不再提供本站下单，只剩「去付款」按钮；首页和商品页不再显示这件商品的库存；这笔钱不进本站的订单和概览收入；每周对账前，要照那边的结算单到「收支」里记「站外收入」（有退款再记「站外退款」），按买家实付的数记，平台抽的手续费另记一笔「支付手续费」。上面的价格只是展示用，要自己和那边保持一致。货放在那边的，本站的卡密库存不用管；那边只卖本站兑换码的，卡密库存照常备货（没货时这件商品会显示售罄），并在商品说明第一行写明「付款后拿到的是兑换码，回本站兑换页取货」。清空再保存，就恢复在本站下单。
          </p>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={p ? p.active === 1 : true}
              className="size-4 accent-primary"
            />
            上架（在店铺里显示并可购买）
          </label>
        </ActionForm>
      </Panel>

      {p && <Inventory productId={p.id} stock={p.stock} sold={p.sold} />}

      {p && (
        <Panel title="删除商品" className="lg:col-span-2">
          <p className="mb-4 text-sm text-muted-foreground">
            会连同未售的卡密和没用过的兑换码一起删掉，删了找不回来。已经有订单的商品不能删，只能下架。
          </p>
          <ActionForm
            action={deleteProduct}
            submit="删除这件商品"
            variant="destructive"
            size="lg"
            confirm={`确定删除「${p.name}」？未售卡密和兑换码会一起删除，无法恢复。`}
          >
            <input type="hidden" name="id" value={p.id} />
          </ActionForm>
        </Panel>
      )}
    </div>
  );
}

function Inventory({ productId, stock, sold }: { productId: number; stock: number; sold: number }) {
  // ponytail: 只列最近 200 条未售卡密，够日常核对；要翻页或搜索时再加
  const cards = all<{ id: number; content: string }>(
    `SELECT id, content FROM cards WHERE product_id = ? AND order_id IS NULL ORDER BY id DESC LIMIT 200`,
    productId,
  );

  return (
    <Panel
      title="卡密库存"
      aside={
        <span className="text-sm text-muted-foreground">
          未售 {stock} 条 · 已售 {sold} 条
        </span>
      }
    >
      <ActionForm action={importCards} submit="导入" size="lg">
        <input type="hidden" name="productId" value={productId} />
        <div className="space-y-1.5">
          <Label htmlFor="cards">批量导入</Label>
          <Textarea
            id="cards"
            name="cards"
            rows={6}
            required
            className="rounded-xl bg-background px-3 py-2.5 font-mono text-sm"
            placeholder={"一行一条，原样发给买家。例如：\nuser01@example.com----密码\nXXXX-XXXX-XXXX-XXXX"}
          />
          <p className="text-xs text-muted-foreground">
            重复的会自动跳过。有等货的订单时，导入后会按付款先后自动补发。
          </p>
        </div>
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <Field
            label="进货单价（元，可以不填）"
            name="unitPrice"
            inputMode="decimal"
            placeholder="5.00"
          />
          <div className="space-y-2">
            <Label htmlFor="paidBy" className="type-small font-semibold">
              谁付的钱
            </Label>
            <select
              id="paidBy"
              name="paidBy"
              defaultValue="account"
              className="h-12 w-full rounded-[12px] border border-input bg-background px-3 text-[17px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {Object.entries(PAYER_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          填了单价，导入后会自动记一笔进货开支：实际新增的条数乘单价。重复被跳过的不算，不填就不记。
        </p>
      </ActionForm>

      <div className="mt-6 border-t pt-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">
            未售卡密
            {stock > cards.length && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                只显示最新的 {cards.length} 条
              </span>
            )}
          </h3>
          {cards.length > 0 && (
            <ActionForm
              action={clearCards}
              submit="清空未售"
              variant="ghost"
              size="sm"
              className="space-y-0"
              confirm={`确定清空全部 ${stock} 条未售卡密？无法恢复。`}
            >
              <input type="hidden" name="productId" value={productId} />
            </ActionForm>
          )}
        </div>
        {cards.length === 0 ? (
          <Empty>没有库存。导入卡密后这里会列出来。</Empty>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
            {cards.map((c) => (
              <li key={c.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{c.content}</code>
                <ActionForm
                  action={deleteCard}
                  submit={<Trash2 aria-label="删除这条卡密" />}
                  variant="ghost"
                  size="icon-sm"
                  className="space-y-0"
                  buttonClassName="text-muted-foreground hover:text-destructive"
                >
                  <input type="hidden" name="id" value={c.id} />
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
