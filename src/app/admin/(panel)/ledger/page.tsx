import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { addExpense, deleteExpense } from "@/app/admin/actions";
import { ActionForm } from "@/components/action-form";
import { Empty, PageTitle, Panel, Pill, WeekNav } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { Field } from "@/components/form-bits";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/guard";
import { WEEK_MS, weekStart } from "@/lib/settle";
import {
  dayKey,
  EARLIEST_DAY,
  expenseBlock,
  KIND_LABEL,
  PAYER_LABEL,
  pickWeek,
  weekExpenses,
  weekLabel,
} from "@/lib/settle-data";
import { yuan } from "@/lib/site";

export const metadata = { title: "收支" };

// 和 Field 里的输入框一样高、一样的圆角
const SELECT =
  "h-12 w-full rounded-[12px] border border-input bg-background px-3 text-[17px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const LABEL = "type-small font-semibold";

type Props = Pick<PageProps<"/admin/ledger">, "searchParams">;

export default function Page({ searchParams }: Props) {
  return (
    <>
      <PageTitle
        title="收支"
        desc="进货、广告、服务器这些付出去的钱，还有在合作平台收到的钱，都记在这里，每周对账时会算进去。"
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Ledger searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const thisWeek = () => weekStart(Date.now());
const today = () => dayKey(Date.now());

async function Ledger({ searchParams }: Props) {
  await requireAdmin();
  const { w } = await searchParams;
  await io();

  const current = thisWeek();
  const week = pickWeek(w, current);
  const expenses = weekExpenses(week);
  const blocked = expenseBlock(week);
  // 看的是已经过完的周时（比如周一从对账页点过来补记上一周的站外收入），
  // 日期默认填那一周的周日，免得一不留神记到本周去
  const defaultDay = week === current ? today() : dayKey(week + WEEK_MS - 1);
  const href = (start: number) => `/admin/ledger?w=${dayKey(start)}`;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[320px_1fr]">
      <Panel title="记一笔">
        <ActionForm action={addExpense} submit="记下来" size="lg">
          <div className="space-y-2">
            <Label htmlFor="kind" className={LABEL}>
              类型
            </Label>
            <select id="kind" name="kind" defaultValue="purchase" className={SELECT}>
              {Object.entries(KIND_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <p className="type-caption text-muted-foreground">
              上游赔偿是供货商赔回来的钱，对账时从进货款里减掉。
            </p>
            <p className="type-caption text-muted-foreground">
              站外收入、站外退款是合作平台（比如链动小铺）那边收到和退掉的钱，照那边的结算单记，对账时并进买家付款和退款。按买家实付的数记，平台抽的手续费另记一笔「支付手续费」。
            </p>
          </div>
          <Field
            label="金额（元）"
            name="amount"
            required
            inputMode="decimal"
            placeholder="100.00"
          />
          <div className="space-y-2">
            <Label htmlFor="paidBy" className={LABEL}>
              谁付的钱
            </Label>
            <select id="paidBy" name="paidBy" defaultValue="account" className={SELECT}>
              {Object.entries(PAYER_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <p className="type-caption text-muted-foreground">
              选甲或乙表示他个人垫付，对账时原数还给他。上游赔偿选的是钱赔到了哪里。站外收入和站外退款保持「收款账户」不用改：合作平台的钱提现到谁个人手里，要先转进收款账户再对账。
            </p>
          </div>
          <Field
            label="日期"
            name="date"
            type="date"
            required
            defaultValue={defaultDay}
            min={EARLIEST_DAY}
            max={today()}
            hint="钱实际进出的那天，记在哪一周就算哪一周的账。站外收入、站外退款填买家付款、退款的那天；照结算单一周合记一笔的，填那一周里的任意一天。"
          />
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" name="fromReserve" className="size-4 accent-primary" />
            从准备金出（不算进本周利润，只减少准备金；站外收入、站外退款不能勾）
          </label>
          <Field label="备注" name="note" maxLength={200} placeholder="可以不填" />
        </ActionForm>
      </Panel>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <WeekNav
            label={weekLabel(week)}
            prev={href(week - WEEK_MS)}
            next={week < current ? href(week + WEEK_MS) : undefined}
            current="/admin/ledger"
          />
          <Link
            href={`/admin/settlement?w=${dayKey(week)}`}
            className="text-sm text-link hover:underline"
          >
            看这一周的对账单
          </Link>
        </div>

        {blocked && (
          <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">{blocked}</p>
        )}

        {expenses.length === 0 ? (
          <Empty>这一周还没有记录。</Empty>
        ) : (
          <Panel className="p-2 sm:p-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日期</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="text-right">金额</TableHead>
                  <TableHead>谁付的钱</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {dayKey(e.happened_at).slice(5)}
                    </TableCell>
                    <TableCell>
                      {KIND_LABEL[e.kind]}
                      {e.from_reserve === 1 && (
                        <Pill className="ml-1.5 bg-warning-soft text-warning">从准备金出</Pill>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.kind === "supplier_refund" || e.kind === "offsite_income" ? (
                        <span className="text-success">
                          {e.kind === "offsite_income" ? "收入" : "收回"} {yuan(e.amount_cents)}
                        </span>
                      ) : (
                        yuan(e.amount_cents)
                      )}
                    </TableCell>
                    <TableCell>{PAYER_LABEL[e.paid_by]}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {e.note || "—"}
                    </TableCell>
                    <TableCell className="w-10">
                      {!blocked && (
                        <ActionForm
                          action={deleteExpense}
                          submit={<Trash2 aria-label="删除这一笔" />}
                          variant="ghost"
                          size="icon-sm"
                          className="space-y-0"
                          buttonClassName="text-muted-foreground hover:text-destructive"
                          confirm={`确定删除这笔${KIND_LABEL[e.kind]} ${yuan(e.amount_cents)}？`}
                        >
                          <input type="hidden" name="id" value={e.id} />
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
