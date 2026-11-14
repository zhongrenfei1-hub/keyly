"use client";

import { useState } from "react";
import { SparkChart } from "@/components/ruixen/spark-chart";
import { yuan } from "@/lib/site";

export type Day = { day: string; revenue: number; orders: number };

/** 近几天的收入曲线。平时显示合计，鼠标移到曲线上显示那一天。每天的数字在下方表格里也能看到。 */
export function RevenueTrend({ days }: { days: Day[] }) {
  const [at, setAt] = useState<number | null>(null);
  const total = days.reduce((sum, d) => sum + d.revenue, 0);
  const picked = at === null ? null : days[at];

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {picked ? picked.day : `近 ${days.length} 天收入`}
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {yuan(picked ? picked.revenue : total)}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {picked ? `${picked.orders} 笔订单` : "移到曲线上看每一天"}
        </p>
      </div>
      <SparkChart
        data={days.map((d) => d.revenue)}
        color="#0284c7"
        height={140}
        className="mt-2"
        onValueChange={(_, i) => setAt(i)}
        onActiveChange={(active) => {
          if (!active) setAt(null);
        }}
      />
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{days[0].day}</span>
        <span>{days[days.length - 1].day}</span>
      </div>
    </div>
  );
}
