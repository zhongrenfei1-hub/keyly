"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { login } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

// 版式照 docs 里用户给的「Aurora Sign Up」稿子：黑底两栏，左边一张圆角大图加三步，右边表单。
// 和稿子不一样的地方：稿子的背景视频是别人的素材，换成自己画的流动天蓝光；
// 这里是登录不是注册，只有一个密码框，所以没有姓名、邮箱和第三方登录按钮。

const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

// 左栏背景的三团光：颜色、位置、漂移的方向
const GLOWS = [
  { color: "#0EA5E9", className: "left-[-20%] top-[-15%] size-[75%]", move: { x: ["0%", "18%", "0%"], y: ["0%", "10%", "0%"] }, duration: 16 },
  { color: "#38BDF8", className: "right-[-25%] top-[10%] size-[70%]", move: { x: ["0%", "-16%", "0%"], y: ["0%", "14%", "0%"] }, duration: 21 },
  { color: "#0369A1", className: "left-[5%] top-[35%] size-[80%]", move: { x: ["0%", "12%", "0%"], y: ["0%", "-10%", "0%"] }, duration: 26 },
];

export function LoginScreen() {
  const [state, run, pending] = useActionState(login, null);
  const [visible, setVisible] = useState(false);
  const still = useReducedMotion();

  return (
    <main className="flex min-h-screen w-full bg-black p-2 text-white transition-all duration-500 selection:bg-white/30 lg:h-screen lg:overflow-hidden lg:p-4">
      {/* 左栏：大屏才有 */}
      <div className="relative hidden h-full w-[52%] flex-col items-center justify-end overflow-hidden rounded-3xl bg-[#041C2E] px-12 pb-32 shadow-2xl lg:flex">
        <div aria-hidden className="absolute inset-0">
          {GLOWS.map((g) => (
            <motion.div
              key={g.color}
              className={cn("absolute rounded-full blur-3xl", g.className)}
              style={{ background: `radial-gradient(closest-side, ${g.color}, transparent)` }}
              animate={still ? undefined : g.move}
              transition={{ duration: g.duration, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
          {/* 底部压暗一点，白字才看得清 */}
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-[#041C2E] to-transparent" />
        </div>

        <motion.div
          className="z-10 w-full max-w-xs space-y-8"
          initial={still ? false : "hidden"}
          animate="show"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } } }}
        >
          <motion.div variants={rise} className="flex items-center justify-center gap-2">
            <KeyRound className="size-5" strokeWidth={2.6} />
            <span className="text-xl font-semibold tracking-tight">Keyly</span>
          </motion.div>
          <motion.div variants={rise} className="space-y-3 text-center">
            <h2 className="text-4xl font-medium tracking-tight whitespace-nowrap">Keyly 后台</h2>
            <p className="px-4 text-sm leading-relaxed text-white/70">登录以后，店里的事都在这里办。</p>
          </motion.div>
          <motion.div variants={rise} className="space-y-3">
            <StepItem number={1} text="输入管理员密码" active />
            <StepItem number={2} text="处理订单和工单" />
            <StepItem number={3} text="每周一对账" />
          </motion.div>
        </motion.div>
      </div>

      {/* 右栏：表单 */}
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-12 sm:px-12 lg:overflow-hidden lg:px-16 lg:py-6 xl:px-24">
        <motion.div
          className="w-full max-w-xl space-y-8"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-medium tracking-tight">登录后台</h1>
            <p className="text-sm text-white/60">填管理员密码进入。</p>
          </div>

          <form
            action={run}
            // 自己接管提交：出错时不清空已经填的内容（和 ActionForm 同一个做法）
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              startTransition(() => run(data));
            }}
            className="space-y-5"
          >
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-white">
                管理员密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={visible ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  className="h-11 w-full rounded-xl border-none bg-[#1A1A1A] px-4 pr-12 text-white outline-none placeholder:text-white/20 focus:ring-2 focus:ring-white/40"
                />
                <button
                  type="button"
                  onClick={() => setVisible((v) => !v)}
                  aria-label={visible ? "隐藏密码" : "显示密码"}
                  aria-pressed={visible}
                  className="absolute top-1/2 right-1 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-white/60 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-white/60">密码是环境变量 ADMIN_PASSWORD 的值。</p>
            </div>

            {state?.error && (
              <p role="alert" className="text-sm text-red-400">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-white font-semibold text-black transition outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black active:scale-[0.98] disabled:opacity-60"
            >
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              登录
            </button>
          </form>

          <p className="text-center text-sm text-white/60">
            不是店里的人？
            <Link href="/" className="font-medium text-white underline-offset-4 hover:underline">
              回店铺首页
            </Link>
          </p>
        </motion.div>
      </div>
    </main>
  );
}

function StepItem({ number, text, active }: { number: number; text: string; active?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl p-3 text-sm font-medium",
        active ? "border border-white bg-white text-black" : "border-none bg-[#1A1A1A] text-white",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-xs",
          active ? "bg-black text-white" : "bg-white/10 text-white/60",
        )}
      >
        {number}
      </span>
      {text}
    </div>
  );
}
