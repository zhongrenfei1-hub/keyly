"use client";

import { Children, useEffect, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ProductMark } from "@/components/product-mark";
import { cn } from "@/lib/utils";

function ShelfMark({ id, name }: { id: string; name: string }) {
  if (id === "hot") {
    return (
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white font-hand text-[22px] leading-none text-link ring-1 ring-black/8">
        Hot
      </span>
    );
  }
  return <ProductMark name={name} />;
}


const EASE = [0.22, 1, 0.36, 1] as const;

export type ShelfBrand = { id: string; name: string; line: string; count: number; from: string };

export function ShelfFolds({ brands, children }: { brands: ShelfBrand[]; children: ReactNode }) {
  const panels = Children.toArray(children);
  const [open, setOpen] = useState<string | null>(null);
  const [wide, setWide] = useState(false);
  const still = useReducedMotion();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => {
      setWide(mq.matches);
      setOpen((current) => {
        const id = window.location.hash.replace(/^#brand-/, "");
        if (brands.some((brand) => brand.id === id)) return id;
        return current ?? brands[0]?.id ?? null;
      });
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [brands]);

  function choose(id: string) {
    setOpen(id);
    history.replaceState(null, "", `#brand-${id}`);
  }

  if (wide) {
    const index = Math.max(0, brands.findIndex((brand) => brand.id === open));
    const brand = brands[index];
    return (
      <>
        <nav aria-label="商品分类" className="seg mt-4 flex w-fit max-w-full overflow-x-auto [scrollbar-width:none]">
          {brands.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === brand?.id ? "true" : undefined}
              onClick={() => choose(item.id)}
              className="seg-item cursor-pointer border-0 bg-transparent"
            >
              {item.name}
            </button>
          ))}
        </nav>
        {brand && (
          <section id={`brand-${brand.id}`} className="scroll-mt-28 pt-6">
            <div className="flex items-center gap-3">
              <ShelfMark id={brand.id} name={brand.name} />
              <span className="min-w-0 flex-1">
                <span className="block type-lead font-semibold">{brand.name}</span>
                <span className="mt-0.5 block font-hand text-[22px] leading-none text-link">{brand.line}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block type-small font-semibold tabular-nums">{brand.from}</span>
                <span className="mt-0.5 block type-caption tabular-nums text-muted-foreground">{brand.count} 件</span>
              </span>
            </div>
            <div className="mt-4">{panels[index]}</div>
          </section>
        )}
      </>
    );
  }

  return (
    <div className="mt-2">
      {brands.map((brand, i) => {
        const on = open === brand.id;
        return (
          <section key={brand.id} id={`brand-${brand.id}`} className="scroll-mt-28 border-b border-black/6 pt-3">
            <button
              type="button"
              aria-expanded={on}
              onClick={() => (on ? setOpen(null) : choose(brand.id))}
              className="flex w-full items-center gap-3 py-4 text-left"
            >
              <ShelfMark id={brand.id} name={brand.name} />
              <span className="min-w-0 flex-1">
                <span className="block type-lead font-semibold">{brand.name}</span>
                <span className="mt-0.5 block font-hand text-[22px] leading-none text-link">{brand.line}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block type-small font-semibold tabular-nums">{brand.from}</span>
                <span className="mt-0.5 block type-caption tabular-nums text-muted-foreground">{brand.count} 件</span>
              </span>
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
                  <div className="pb-6">{panels[i]}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}
