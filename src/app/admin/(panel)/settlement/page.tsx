import { Suspense } from "react";
import { io } from "next/cache";
import Link from "next/link";
import { confirmSettlement, saveSettings } from "@/app/admin/actions";
import { ActionForm } from "@/components/action-form";
import { Empty, PageTitle, Panel, WeekNav } from "@/components/admin-bits";
import { Skeleton } from "@/components/brand";
import { Field } from "@/components/form-bits";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { get } from "@/lib/db";
import { requireAdmin } from "@/lib/guard";
import { WEEK_MS, weekStart } from "@/lib/settle";
import type { ExpenseKind } from "@/lib/settle";
import {
  archiveBlock,
  dayKey,
  EARLIEST_DAY,
  expenseBlock,
  getSettings,
  KIND_LABEL,
  openWeekBefore,
  parseDay,
  PAYER_LABEL,
  pickWeek,
  weekLabel,
  weekSources,
  weekView,
} from "@/lib/settle-data";
import type { WeekView } from "@/lib/settle-data";
import { fmtTime, yuan } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata = { title: "对账" };

type Props = Pick<PageProps<"/admin/settlement">, "searchParams">;

export default function Page({ searchParams }: Props) {
  return (
    <>
      <PageTitle
        title="对账"
        desc="按周算账：一周从北京时间周一 0 点到下周一 0 点，只算实际收到和付出去的钱。"
      />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Settlement searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const thisWeek = () => weekStart(Date.now());

/** 结果类的数，负数写成「−¥1.00」 */
const signed = (c: number) => (c < 0 ? `−${yuan(-c)}` : yuan(c));
/** 从可以分的钱里拿走的数：拿走写成负的，放回来写成正的 */
const out = (c: number) => (c > 0 ? `−${yuan(c)}` : c < 0 ? `+${yuan(-c)}` : yuan(0));

async function Settlement({ searchParams }: Props) {
  await requireAdmin();
  const { w } = await searchParams;
  await io();

  const current = thisWeek();
  const week = pickWeek(w, current - WEEK_MS); // 默认看最近一个已经过完的周
  const settings = getSettings();
  const view = weekView(week);
  const archived = view.confirmedAt !== null;
  const open = archived ? null : openWeekBefore(week);
  const blocked = archived ? null : archiveBlock(week);
  const sources = weekSources(week);
  // 有商品走站外付款、这一周却一笔站外收入都没记：多半是忘了记，提醒一下。
  // 只知道「现在有没有这样的商品」，不知道那边这一周到底有没有成交，所以只是提醒，不拦存档。
  // 已经存档的周只读，不用再提醒；排在存档前面的空周、早于最早可记日期的周根本记不进去，也不提醒。
  const missingOffsite =
    !archived &&
    view.offsite.incomeCents === 0 &&
    expenseBlock(week) === null &&
    week + WEEK_MS > parseDay(EARLIEST_DAY) &&
    get(`SELECT 1 FROM products WHERE buy_url <> '' LIMIT 1`) !== undefined;
  const href = (start: number) => `/admin/settlement?w=${dayKey(start)}`;

  const { input, result: r } = view;
  const people = (["a", "b"] as const).map((who) => {
    const share = who === "a" ? r.shareACents : r.shareBCents;
    const advance = who === "a" ? r.advanceACents : r.advanceBCents;
    const fee = input.holder === who ? r.holderFeeCents : 0;
    return { who, share, advance, fee, total: share + advance + fee };
  });
  // 准备金由不挂收款账户的那个人保管
  const keeper = input.holder === "a" ? "乙" : input.holder === "b" ? "甲" : "待定";

  return (
    <div className="space-y-4">
      <Panel
        title="设置"
        aside={<span className="text-sm text-muted-foreground">只影响还没存档的周</span>}
      >
        <ActionForm action={saveSettings} submit="保存设置" size="lg">
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field
              label="乙的比例（%）"
              name="shareB"
              type="number"
              min={1}
              max={99}
              step={1}
              required
              defaultValue={settings.shareB}
              hint="填 1 到 99 的整数，其余归甲。"
            />
            <fieldset className="space-y-3">
              <legend className="type-small font-semibold">收款账户挂在谁名下</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {(["a", "b", ""] as const).map((value) => (
                  <label key={value} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="holder"
                      value={value}
                      defaultChecked={settings.holder === value}
                      className="size-4 accent-primary"
                    />
                    {value ? PAYER_LABEL[value] : "还没定"}
                  </label>
                ))}
              </div>
              <p className="type-caption text-muted-foreground">
                挂名人每周拿（买家付款 − 退款）的 1%；还没定时不计。
              </p>
            </fieldset>
          </div>
        </ActionForm>
      </Panel>

      <WeekNav
        label={weekLabel(week)}
        prev={href(week - WEEK_MS)}
        next={week < current ? href(week + WEEK_MS) : undefined}
        current={href(current)}
      />

      {archived && (
        <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
          这一周已经存档，存档时间 {fmtTime(view.confirmedAt!)}。下面是存档里的数字，不会再变。
        </p>
      )}
      {week === current && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          本周还没过完，数字会变。
        </p>
      )}
      {missingOffsite && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          有商品走站外付款，这一周还没有记站外收入。先看合作平台这一周的结算单：有成交，就到「收支」里记一笔「站外收入」（有退款再记「站外退款」），才会算进买家付款，不记的话利润会偏低，存档以后改不了；确实没有成交，就不用管这一条。
          <Link href={`/admin/ledger?w=${dayKey(week)}`} className="ml-1 underline">
            去记一笔
          </Link>
        </p>
      )}
      {open !== null && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          {weekLabel(open)} 这一周有订单或收支记录，还没存档。下面的期初数字是按更早的存档算的，等前面的周存档以后会变。
          <Link href={href(open)} className="ml-1 underline">
            去看那一周
          </Link>
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
        <Panel title="对账单" className="min-w-0">
          <Statement view={view} />
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel title="每个人本周该拿到的钱">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead />
                  <TableHead className="text-right">分成</TableHead>
                  <TableHead className="text-right">垫款</TableHead>
                  <TableHead className="text-right">挂名补偿</TableHead>
                  <TableHead className="text-right">合计</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.who}>
                    <TableCell className="font-medium">{PAYER_LABEL[p.who]}</TableCell>
                    <TableCell className="text-right tabular-nums">{yuan(p.share)}</TableCell>
                    <TableCell className="text-right tabular-nums">{signed(p.advance)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {input.holder === p.who ? yuan(p.fee) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {signed(p.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-sm text-muted-foreground">
              准备金（期末 {signed(r.reserveCents)}）由谁保管：{keeper}
              {input.holder ? "，也就是不挂收款账户的那个人。" : "，要先定收款账户挂在谁名下。"}
            </p>
          </Panel>

          <Panel title="本周订单来源">
            {sources.length === 0 ? (
              <Empty>这一周没有在本站付款的订单。</Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>来源</TableHead>
                    <TableHead className="text-right">订单数</TableHead>
                    <TableHead className="text-right">金额</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell className="max-w-40 truncate">
                        {s.source || "直接访问或未知"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{s.orders}</TableCell>
                      <TableCell className="text-right tabular-nums">{yuan(s.cents)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              只列在本站付款的订单。在合作平台付款的没有本站订单，不在这里，金额见对账单「买家付款」一行的说明。
            </p>
          </Panel>

          <Panel title="确认并存档">
            {archived ? (
              <p className="text-sm text-muted-foreground">
                已在 {fmtTime(view.confirmedAt!)} 存档。这一周只读，收支记录也不能再增删。
              </p>
            ) : blocked ? (
              <p className="text-sm text-muted-foreground">{blocked}</p>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted-foreground">
                  核对无误后存档。存档以后这一周的数字不再变，收支记录也不能再增删；这一周的期末数字就是下一周的期初。
                </p>
                <ActionForm
                  action={confirmSettlement}
                  submit="确认并存档"
                  size="lg"
                  confirm={`确认 ${weekLabel(week)} 这一周的对账单并存档？存档后不能撤回，这一周也不能再增删收支记录。`}
                >
                  <input type="hidden" name="week" value={dayKey(week)} />
                </ActionForm>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** 对账单：从上到下每一步一行，右边是金额，必要的行下面用小字写算法。 */
function Statement({ view: { input, result: r, offsite } }: { view: WeekView }) {
  const { prev } = input;
  // 进了利润公式的开支（不含从准备金出的）按类型合计
  const spent = (kind: ExpenseKind) =>
    input.expenses
      .filter((e) => !e.fromReserve && e.kind === kind)
      .reduce((n, e) => n + e.amountCents, 0);
  const reserveOpen = prev.reserveCents - r.reserveSpentCents;
  const positive = r.baseCents > 0;

  type Line = { label: string; amount: string; note?: string; strong?: boolean };
  const steps: Line[] = [
    {
      label: "买家付款",
      amount: yuan(input.paymentsCents),
      note:
        offsite.incomeCents > 0
          ? `在本站付款的订单 ${yuan(input.paymentsCents - offsite.incomeCents)}（按付款时间，不含兑换码取货），加上记在收支里的站外收入 ${yuan(offsite.incomeCents)}。之后退款的也算在这里。`
          : "付款时间落在这一周、在本站付款的订单，不含兑换码取货；之后退款的也算在这里。在合作平台收到的钱，要在「收支」里记成站外收入才会算进来。",
    },
    {
      label: "退款",
      amount: out(input.refundsCents),
      note:
        offsite.refundsCents > 0
          ? `在本站退款的订单 ${yuan(input.refundsCents - offsite.refundsCents)}（按退款时间），加上记在收支里的站外退款 ${yuan(offsite.refundsCents)}。`
          : "退款时间落在这一周的订单。合作平台那边的退款，要在「收支」里记成站外退款。",
    },
    {
      label: "进货款",
      amount: out(r.purchasesCents),
      note: `进货 ${yuan(spent("purchase"))}，减去上游赔偿 ${yuan(spent("supplier_refund"))}。`,
    },
    {
      label: "其他开支",
      amount: out(r.otherExpensesCents),
      note:
        (["ads", "infra", "fee", "other"] as const)
          .map((k) => `${KIND_LABEL[k]} ${yuan(spent(k))}`)
          .join("，") + "。",
    },
    {
      label: "挂名补偿",
      amount: out(r.holderFeeCents),
      note: input.holder
        ? `（买家付款 − 退款）的 1%，小于 0 时按 0。收款账户挂在${PAYER_LABEL[input.holder]}名下。`
        : "还没定收款账户挂在谁名下，不计。",
    },
    { label: "本周利润", amount: signed(r.profitCents), strong: true },
    { label: "上周留下的亏损", amount: signed(prev.carryCents) },
    {
      label: "可处理的数",
      amount: signed(r.baseCents),
      note: positive
        ? "本周利润加上周留下的亏损。"
        : "本周利润加上周留下的亏损。它不大于 0，所以本周不留准备金、不动周转金、不分钱，原样留到下一周。",
    },
    {
      label: "留准备金",
      amount: out(r.reserveAddCents),
      note: positive
        ? `可处理的数的 20% 是 ${yuan(Math.round(r.baseCents / 5))}；上限 ${yuan(r.reserveCapCents)}，已有 ${signed(reserveOpen)}，最多补到上限。上限是最近 30 天买家付款（${yuan(input.last30PaymentsCents)}）的 15%，不到 ${yuan(200000)} 时按 ${yuan(200000)} 算。`
        : undefined,
    },
    {
      label: "周转金变化",
      amount: out(r.floatChangeCents),
      note: positive
        ? `留给下一周进货用。目标 ${yuan(r.floatTargetCents)}（按这一周的进货款定），已有 ${yuan(prev.floatCents)}。不够就补，最多补到留完准备金剩下的钱为止；多了就放回来一起分。`
        : undefined,
    },
    { label: "可以分的钱", amount: yuan(r.payoutCents), strong: true },
    {
      label: "乙分到",
      amount: yuan(r.shareBCents),
      note: `可以分的钱的 ${input.shareB}%，四舍五入到分。`,
    },
    { label: "甲分到", amount: yuan(r.shareACents), note: "其余归甲。" },
  ];
  const balances: Line[] = [
    {
      label: "要还给甲的垫款",
      amount: signed(r.advanceACents),
      note: r.advanceACents < 0 ? "负数表示上游赔偿进了甲个人那里，甲要交回收款账户。" : undefined,
    },
    {
      label: "要还给乙的垫款",
      amount: signed(r.advanceBCents),
      note: r.advanceBCents < 0 ? "负数表示上游赔偿进了乙个人那里，乙要交回收款账户。" : undefined,
    },
    {
      label: "期末准备金余额",
      amount: signed(r.reserveCents),
      note: `期初 ${signed(prev.reserveCents)}，本周从准备金出 ${signed(r.reserveSpentCents)}，本周留 ${yuan(r.reserveAddCents)}。`,
    },
    {
      label: "期末周转金余额",
      amount: yuan(r.floatCents),
      note: `期初 ${yuan(prev.floatCents)}。留在收款账户里给下一周进货用。`,
    },
    { label: "留到下一周的亏损", amount: signed(r.carryCents) },
  ];

  const row = (l: Line) => (
    <TableRow key={l.label}>
      <TableCell className="whitespace-normal">
        <span className={cn(l.strong && "font-semibold")}>{l.label}</span>
        {l.note && <p className="mt-0.5 text-xs text-muted-foreground">{l.note}</p>}
      </TableCell>
      <TableCell className={cn("text-right align-top tabular-nums", l.strong && "font-semibold")}>
        {l.amount}
      </TableCell>
    </TableRow>
  );

  return (
    <Table>
      <TableBody>
        {steps.map(row)}
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={2} className="pt-5 text-xs font-medium text-muted-foreground">
            垫款和各项余额
          </TableCell>
        </TableRow>
        {balances.map(row)}
      </TableBody>
    </Table>
  );
}
