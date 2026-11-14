"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { yuan } from "@/lib/site";

/** 数量加减 + 合计金额。children 是夹在两者之间的其他表单字段。 */
export function QtyField({
  priceCents,
  max,
  children,
}: {
  priceCents: number;
  max: number;
  children?: React.ReactNode;
}) {
  const [qty, setQty] = useState(1);
  const set = (n: number) => setQty(Math.max(1, Math.min(Math.max(max, 1), n || 1)));
  const step =
    "grid size-9 place-items-center rounded-full text-foreground/70 transition-all duration-[400ms] ease-soft hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30";

  return (
    <>
      <div className="flex items-center justify-between">
        <label htmlFor="quantity" className="type-small font-semibold">
          数量
        </label>
        <div className="flex items-center rounded-full border border-input bg-card p-0.5">
          <button type="button" aria-label="减少一件" className={step} disabled={qty <= 1} onClick={() => set(qty - 1)}>
            <Minus className="size-4" />
          </button>
          <input
            id="quantity"
            name="quantity"
            inputMode="numeric"
            autoComplete="off"
            value={qty}
            onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")))}
            className="w-10 bg-transparent text-center type-body tabular-nums outline-none"
          />
          <button type="button" aria-label="增加一件" className={step} disabled={qty >= max} onClick={() => set(qty + 1)}>
            <Plus className="size-4" />
          </button>
        </div>
      </div>
      {children}
      <div className="flex items-baseline justify-between border-t border-input pt-5">
        <span className="type-small text-muted-foreground">合计</span>
        <span className="type-title tabular-nums">
          {yuan(priceCents * qty)}
        </span>
      </div>
    </>
  );
}
