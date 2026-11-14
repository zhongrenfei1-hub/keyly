"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { Circle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { login, register } from "@/app/(shop)/account-actions";
import { cn } from "@/lib/utils";

// Aurora Sign Up 的两栏版式。左边原稿是别人的视频，这里换成店里的深蓝流动背景，上面不加遮罩。
// 提交仍走 account-actions 里现成的 register / login。

const rise = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

const STEPS = ["Register your identity", "Configure your studio", "Finalize your profile"] as const;
const LOGIN_STEPS = ["Google or WeChat", "Or use your email", "Orders stay on this account"] as const;

export function BuyerAuthScreen({ mode, error }: { mode: "login" | "register"; error?: string }) {
  const action = mode === "login" ? login : register;
  const [state, run, pending] = useActionState(action, null);
  const still = useReducedMotion();

  return (
    <main className="page-backdrop flex min-h-dvh w-full flex-col px-3 pt-[max(12px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))] text-foreground selection:bg-sky-200 lg:h-dvh lg:flex-row lg:overflow-hidden lg:p-4">
      <div className="relative mb-4 h-40 shrink-0 overflow-hidden rounded-3xl lg:hidden">
        <Wash still={still} />
        <div className="relative z-10 flex h-full flex-col items-center justify-end px-4 pb-5 text-center text-[#082f49]">
          <p className="font-hand text-[28px] leading-none">
            {mode === "login" ? "Welcome back" : "Join Keyly"}
          </p>
          <p className="mt-1 text-sm text-[#082f49]/70">
            {mode === "login" ? "谷歌、微信，或邮箱" : "邮箱注册，也可以用谷歌或微信"}
          </p>
        </div>
      </div>

      <div className="relative hidden h-full w-[52%] flex-col items-center justify-end overflow-hidden rounded-3xl px-12 pb-32 shadow-2xl lg:flex">
        <Wash still={still} />
        <motion.div
          className="z-10 w-full max-w-xs space-y-8"
          initial={still ? false : "hidden"}
          animate="show"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } } }}
        >
          <motion.div variants={rise} className="flex items-center justify-center gap-2 text-[#082f49]">
            <Circle className="size-5 fill-[#0284c7] text-[#0284c7]" strokeWidth={2.6} />
            <span className="text-xl font-semibold tracking-tight">Keyly</span>
          </motion.div>
          <motion.div variants={rise} className="space-y-3 text-center text-[#082f49]">
            <h2 className="text-4xl font-medium tracking-tight whitespace-nowrap">
              {mode === "login" ? "Welcome back" : "Join Keyly"}
            </h2>
            <p className="px-4 text-sm leading-relaxed text-[#082f49]/60">
              {mode === "login"
                ? "Google, WeChat, or the email you already use."
                : "Follow these 3 quick phases to activate your space."}
            </p>
          </motion.div>
          <motion.div variants={rise} className="space-y-3">
            {(mode === "login" ? LOGIN_STEPS : STEPS).map((text, i) => (
              <StepItem key={text} number={i + 1} text={text} active={i === 0} />
            ))}
          </motion.div>
        </motion.div>
      </div>

      <div className="flex flex-1 flex-col items-center px-1 py-2 sm:px-8 lg:justify-center lg:overflow-y-auto lg:px-16 lg:py-6 xl:px-24">
        <motion.div
          className="w-full max-w-xl space-y-8 sm:space-y-10 lg:space-y-6"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <div className="hidden space-y-2 text-center lg:block">
            <h1 className="text-3xl font-medium tracking-tight">
              {mode === "register" ? "Create New Profile" : "Welcome back"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "register"
                ? "Input your basic details to begin the journey."
                : "用谷歌或微信登录，也可以用邮箱。"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <SocialLink href="/api/auth/google" label="Google" icon={<GoogleMark />} />
            <SocialLink href="/api/auth/wechat" label="微信" icon={<WechatMark />} />
          </div>
          <div className="relative flex items-center">
            <div className="w-full border-t border-black/10" />
            <span className="absolute left-1/2 -translate-x-1/2 bg-[#f4f6f8] px-4 text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Or
            </span>
          </div>

          <form
            action={run}
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              if (mode === "register") data.set("again", String(data.get("password") ?? ""));
              startTransition(() => run(data));
            }}
            className="space-y-5"
          >
            {mode === "register" ? (
              <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2">
                <InputGroup label="First Name" name="first" placeholder="Ada" autoComplete="given-name" />
                <InputGroup label="Last Name" name="last" placeholder="Lovelace" autoComplete="family-name" />
              </div>
            ) : null}
            <InputGroup label="Email" name="email" type="email" placeholder="you@example.com" autoComplete="email" />
            <PasswordField autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {state?.error ? (
              <p role="alert" className="text-sm text-red-600">
                {state.error}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0284c7] text-base font-semibold text-white transition outline-none hover:bg-[#0369a1] focus-visible:ring-2 focus-visible:ring-[#0284c7] focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60"
            >
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {mode === "register" ? "Create Account" : "Log in"}
            </button>
          </form>

          <p className="pb-2 text-center text-sm text-[#082f49]/70">
            {mode === "register" ? (
              <>
                已有账号？{" "}
                <Link href="/login" className="font-medium text-[#082f49] underline-offset-4 hover:underline">
                  登录
                </Link>
              </>
            ) : (
              <>
                还没有账号？{" "}
                <Link href="/register" className="font-medium text-[#082f49] underline-offset-4 hover:underline">
                  注册
                </Link>
              </>
            )}
            <span className="mx-2 text-[#082f49]/30">·</span>
            <Link href="/" className="font-medium text-[#082f49] underline-offset-4 hover:underline">
              回商店
            </Link>
          </p>
        </motion.div>
      </div>
    </main>
  );
}

function Wash({ still }: { still: boolean | null }) {
  if (still) return <img src="/hero-wash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />;
  return (
    <video autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover">
      <source src="/hero-wash.mp4" type="video/mp4" />
    </video>
  );
}

function SocialLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <a
      href={href}
      className="flex h-12 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-base font-medium text-[#082f49] shadow-sm transition hover:bg-sky-50"
    >
      {icon}
      {label}
    </a>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#EA4335" d="M12 11v3.2h5.5c-.2 1.4-1.7 4.1-5.5 4.1A6.3 6.3 0 1 1 12 5.7c1.8 0 3 .8 3.7 1.4l2.5-2.4C16.7 3.2 14.6 2.3 12 2.3a9.7 9.7 0 1 0 0 19.4c5.6 0 9.3-3.9 9.3-9.4 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}

function WechatMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#07C160"
        d="M9.5 4C5.4 4 2 6.9 2 10.4c0 2 1.1 3.8 2.9 5l-.7 2.2 2.5-1.3c.8.2 1.6.4 2.4.4.3 0 .6 0 .9-.1A4.8 4.8 0 0 1 9 14.7c0-3.2 3-5.8 6.6-5.8.3 0 .6 0 .9.1C15.7 6.2 12.9 4 9.5 4zm-2 4.2a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6zm4.2 0a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6zM15.6 10c-3 0-5.5 2.1-5.5 4.7s2.5 4.7 5.5 4.7c.6 0 1.2-.1 1.7-.2l2 .9-.6-1.8c1.4-.9 2.3-2.2 2.3-3.6 0-2.6-2.5-4.7-5.4-4.7zm-1.7 3.3a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2zm3.4 0a.6.6 0 1 1 0-1.2.6.6 0 0 1 0 1.2z"
      />
    </svg>
  );
}

function StepItem({ number, text, active }: { number: number; text: string; active?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl p-3 text-sm font-medium",
        active ? "border border-sky-200 bg-white text-[#082f49] shadow-sm" : "border border-white/70 bg-white/55 text-[#082f49]",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full text-xs",
          active ? "bg-[#0284c7] text-white" : "bg-white text-[#082f49]/50",
        )}
      >
        {number}
      </span>
      {text}
    </div>
  );
}

function InputGroup({
  label,
  name,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={name} className="text-sm font-medium text-[#082f49]">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-black/10 bg-white px-4 text-base text-[#082f49] outline-none placeholder:text-[#082f49]/30 focus:ring-2 focus:ring-sky-300"
      />
    </div>
  );
}

function PasswordField({ autoComplete }: { autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor="password" className="text-sm font-medium text-[#082f49]">
        Password
      </label>
      <div className="relative">
        <input
          id="password"
          name="password"
          type={visible ? "text" : "password"}
          required
          minLength={8}
          maxLength={72}
          autoComplete={autoComplete}
          placeholder="至少 8 位"
          className="h-12 w-full rounded-xl border border-black/10 bg-white px-4 pr-12 text-base text-[#082f49] outline-none placeholder:text-[#082f49]/30 focus:ring-2 focus:ring-sky-300"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "隐藏密码" : "显示密码"}
          aria-pressed={visible}
          className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-[#082f49]/50 outline-none hover:text-[#082f49] focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      <p className="text-xs text-[#082f49]/50">至少 8 位。</p>
    </div>
  );
}
