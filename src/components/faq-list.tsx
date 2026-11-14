"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { FAQ } from "@/lib/faq";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

export function FaqList() {
  const [open, setOpen] = useState<number | null>(null);
  const still = useReducedMotion();

  return (
    <div className="card-solid mt-6 px-5 py-1 sm:px-8 sm:py-2">
      {FAQ.map(({ q, a }, i) => {
        const on = open === i;
        return (
          <div key={q} className="border-b border-input last:border-b-0">
            <button
              type="button"
              aria-expanded={on}
              onClick={() => setOpen(on ? null : i)}
              className="flex w-full items-center justify-between gap-4 py-5 text-left type-body font-semibold sm:type-lead"
            >
              {q}
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-all duration-500 ease-soft",
                  on && "rotate-45 bg-[#F0F9FF] text-link",
                )}
              >
                <Plus className="size-5" />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div
                  initial={still ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={still ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                  transition={{ duration: still ? 0 : 0.48, ease: EASE }}
                  className="overflow-hidden"
                >
                  <p className="max-w-3xl pb-6 type-body text-muted-foreground">{a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
