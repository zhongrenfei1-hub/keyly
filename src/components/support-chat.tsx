"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { ArrowUp, LoaderCircle, MessageCircle, UserRound, X } from "lucide-react";
import Link from "next/link";
import { submitChatTicket, verifyChatBuyer } from "@/app/(shop)/actions";
import type { FormState } from "@/components/action-form";
import { cn } from "@/lib/utils";
import "./support-chat.css";

type Msg = { from: "bot" | "me"; text: string };

// 这里没有真人在线，也没有接 AI。第一句话就要说清楚，免得买家守着窗口等回复
const HELLO =
  "你好。这里是自动回复和留言，没有人实时在线。点下面的常见问题可以直接看到答案。要给客服留言，先在底下用订单号和下单邮箱验证一下，客服看到后按下单邮箱回复。";

/** 入场动画的起点：稿子时间轴上的第几秒（样式里再统一乘系数） */
const at = (t: number) => ({ "--at": t }) as React.CSSProperties;

const PREFIX = /^\/hds-[a-z0-9]+-\d+-[a-z0-9]+(?=\/|$)/i;

function BotAvatar() {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const prefix = PREFIX.exec(window.location.pathname)?.[0] ?? "";
    video.poster = `${prefix}/home-bg-2.jpg`;
    video.src = `${prefix}/home-bg-2.mp4`;
    video.play().catch(() => {});
  }, []);
  return (
    <span aria-hidden className="relative size-8 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10">
      <video ref={ref} className="size-full object-cover" autoPlay muted loop playsInline />
    </span>
  );
}

const FIELD =
  "mt-1 h-10 w-full rounded-[12px] border border-black/10 bg-white px-3 text-[16px] text-[#1d1d1f] outline-none transition-colors duration-[400ms] ease-soft placeholder:text-[#8b8b8d] focus-visible:border-[#7dd3fc] focus-visible:ring-2 focus-visible:ring-[#7dd3fc]/40";

/**
 * 前台每一页右下角的客服对话框（定法第四份）。
 * 常见问题点了就用现成的答案回一条；买家打的字是留言，走售后工单（submitTicket），校验和限流都在那边。
 * 不是模态框：开着的时候还能去页面上复制订单号。
 */
export function SupportChat({ faq }: { faq: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{ from: "bot", text: HELLO }]);
  // 打开那一刻已有几条：这几条跟着入场依次出现，之后新来的立刻出现
  const [seen, setSeen] = useState(1);
  const [error, setError] = useState<string | null>(null);
  // 验证过的买家。只是界面状态：每次留言服务端都会重新核对订单号和邮箱
  const [buyer, setBuyer] = useState<{ orderNo: string; email: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const titleId = useId();
  const panelId = useId();
  const launcher = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const draft = useRef<HTMLTextAreaElement>(null);

  // 焦点：打开时进对话框，关上时还给右下角的按钮；Esc 关闭
  useEffect(() => {
    if (!open) return;
    const box = panel.current;
    const opener = launcher.current;
    box?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // 输入法选字时的 Esc 是取消选字，不是关窗
      if (e.key === "Escape" && !e.isComposing) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // 买家已经点到页面别处去了，就不抢焦点
      const now = document.activeElement;
      if (!now || now === document.body || box?.contains(now)) opener?.focus();
    };
  }, [open]);

  // 有新气泡就滚到底；最新一条太长、头被顶出去了，就退回到它的开头
  useEffect(() => {
    const box = scroller.current;
    const last = log.current?.lastElementChild;
    if (!box || !(last instanceof HTMLElement)) return;
    box.scrollTop = box.scrollHeight;
    if (last.offsetTop < box.scrollTop) box.scrollTop = last.offsetTop - 12;
  }, [messages, open]);

  function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      let res: FormState;
      try {
        res = await verifyChatBuyer(null, data);
      } catch {
        res = { error: "没验证成功，可能是网络断了，请再试一次。" };
      }
      if (!res?.ok) {
        setError(res?.error ?? "没验证成功，请再试一次。");
        return;
      }
      setBuyer({
        orderNo: res.ok,
        email: String(data.get("email") ?? "").trim().toLowerCase(),
      });
      setMessages((m) => [...m, { from: "bot", text: `已验证订单 ${res.ok}。现在可以写留言了。` }]);
    });
  }

  function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // 回车走的 requestSubmit() 不看发送按钮是否禁用，正在发的时候得自己挡住，不然同一条留言会写成两张工单
    if (pending || !buyer) return;
    const data = new FormData(e.currentTarget);
    const content = String(data.get("content") ?? "").trim();
    setError(null);
    startTransition(async () => {
      let res: FormState;
      try {
        res = await submitChatTicket(null, data);
      } catch {
        res = { error: "没发出去，可能是网络断了。写的内容还在，过一会儿再点一次发送。" };
      }
      if (!res?.ok) {
        setError(res?.error ?? "没发出去，请再试一次。");
        return;
      }
      // 验证状态留着，接着补充时不用再验证
      if (draft.current) draft.current.value = "";
      setMessages((m) => [
        ...m,
        { from: "me", text: content },
        { from: "bot", text: `${res.ok}回复会发到邮箱，不会出现在这个窗口，现在可以关掉了。` },
      ]);
    });
  }

  return (
    <div className="chat-root">
      <button
        ref={launcher}
        type="button"
        hidden={open}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setSeen(messages.length);
          setOpen(true);
        }}
        className="fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-50 grid size-[60px] place-content-center justify-items-center gap-0.5 rounded-full bg-[linear-gradient(135deg,#7ec8f0,#d7e7f8_55%,#f6e6c4)] text-[#0c4a6e] shadow-[0_8px_24px_rgb(8_47_73/0.18)] transition-colors duration-[400ms] ease-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:right-5 sm:bottom-5"
      >
        <MessageCircle aria-hidden className="size-5" />
        <span className="type-caption font-semibold">客服</span>
      </button>

      <div
        ref={panel}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        tabIndex={-1}
        hidden={!open}
        className={cn(
          "chat-panel",
          // 手机上贴底、占满宽度；桌面上是右下角一张 400 宽的卡
          "fixed inset-x-0 bottom-0 z-50 flex h-[min(620px,calc(100dvh-12px))] flex-col rounded-t-[22px] p-2 pb-[max(8px,env(safe-area-inset-bottom))] outline-none sm:inset-x-auto sm:right-5 sm:bottom-5 sm:h-[min(620px,calc(100dvh-40px))] sm:w-[400px] sm:rounded-[22px] sm:pb-2",
        )}
      >
        <div
          className={cn("chat-lift", "flex items-center gap-3 pt-1 pr-1 pb-2.5 pl-3 text-primary-foreground")}
          style={at(0.28)}
        >
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="type-small font-semibold">
              客服留言
            </h2>
            <p className="type-caption">自动回复，不是实时对话</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="关闭客服对话框"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-white/80 transition-colors duration-[400ms] ease-soft hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#082f49]"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className={cn("chat-card", "flex min-h-0 flex-1 flex-col rounded-[16px]")}>
          <div
            ref={scroller}
            // 深色卡片上的滚动条也要深色的细条：Windows 和接了鼠标的 Mac 滚动条常驻，默认是一条白边
            className="relative min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3.5 [scrollbar-width:thin]"
          >
            <div ref={log} role="log" aria-label="对话记录" className="space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn("chat-lift", "flex items-end gap-2", m.from === "me" && "justify-end")}
                  style={i < seen ? at(0.48 + Math.min(i, 6) * 0.065) : undefined}
                >
                  {m.from === "bot" && <BotAvatar />}
                  <p className="chat-bubble">
                    <span className="sr-only">{m.from === "bot" ? "自动回复：" : "你："}</span>
                    {m.text}
                  </p>
                  {m.from === "me" && (
                    <span
                      aria-hidden
                      className="grid size-6 shrink-0 place-items-center rounded-full bg-[#e8f4fc] text-[#0c4a6e]"
                    >
                      <UserRound className="size-3.5" />
                    </span>
                  )}
                </div>
              ))}
            </div>
            {/* 常见问题一直跟在最后一条气泡后面，看完一个答案可以接着点下一个 */}
            <div
              role="group"
              aria-label="常见问题"
              className={cn("chat-lift", "flex flex-wrap gap-2 pl-8")}
              style={at(0.48 + Math.min(seen, 7) * 0.065)}
            >
              {faq.map(({ q, a }) => (
                <button
                  key={q}
                  type="button"
                  onClick={() =>
                    setMessages((m) => [...m, { from: "me", text: q }, { from: "bot", text: a }])
                  }
                  className={cn(
                    "chat-faq",
                    "rounded-[16px] px-3 py-2 text-left text-[13px] leading-5 focus-visible:outline-2 focus-visible:outline-[#7dd3fc]",
                  )}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {buyer ? (
            <form
              onSubmit={send}
              className={cn("chat-lift", "space-y-2.5 border-t border-black/[0.06] p-3")}
              style={at(0.84)}
            >
              <input type="hidden" name="orderNo" value={buyer.orderNo} />
              <input type="hidden" name="email" value={buyer.email} />
              <p className="flex items-center justify-between gap-2 type-caption text-[#6b7280]">
                <span className="min-w-0 truncate">
                  订单 <span className="font-mono">{buyer.orderNo}</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setBuyer(null);
                    setError(null);
                  }}
                  className="shrink-0 text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[#7dd3fc]"
                >
                  换一个订单
                </button>
              </p>
              {error && (
                <p role="alert" className="type-small text-[#b42318]">
                  {error}
                </p>
              )}
              <div className="flex items-end gap-2 rounded-[26px] bg-[#fdfdfd] p-1 pl-4 has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-[#7dd3fc]">
                <textarea
                  ref={draft}
                  name="content"
                  required
                  minLength={5}
                  maxLength={2000}
                  rows={1}
                  enterKeyHint="send"
                  aria-label="留言内容，回车发送，Shift 加回车换行"
                  placeholder="写下问题，留言给客服"
                  onKeyDown={(e) => {
                    // 回车发送，Shift+回车换行；输入法选字时的回车不算（Safari 靠 229 认）
                    if (e.key !== "Enter" || e.shiftKey) return;
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }}
                  className="max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-6 text-[#111] outline-none [field-sizing:content] placeholder:text-[#6b6b6d]"
                />
                <button
                  type="submit"
                  disabled={pending}
                  aria-label={pending ? "正在发送" : "发送留言"}
                  className={cn(
                    "chat-send",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0284c7]",
                  )}
                >
                  <span className="chat-send-inner">
                    {pending ? (
                      <LoaderCircle aria-hidden className="size-4 animate-spin" />
                    ) : (
                      <ArrowUp aria-hidden className="size-[18px]" />
                    )}
                  </span>
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={verify}
              className={cn("chat-lift", "space-y-2.5 border-t border-black/[0.06] p-3")}
              style={at(0.84)}
            >
              <p className="type-caption text-[#6b7280]">给客服留言前，先用订单号和下单邮箱验证一下。</p>
              <div className="grid grid-cols-[1fr_1.35fr] gap-2">
                <label className="block min-w-0 type-caption text-[#6b7280]">
                  订单号
                  <input
                    name="orderNo"
                    required
                    maxLength={40}
                    autoComplete="off"
                    placeholder="K 开头"
                    className={cn(FIELD, "font-mono")}
                  />
                </label>
                <label className="block min-w-0 type-caption text-[#6b7280]">
                  下单邮箱
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={FIELD}
                  />
                </label>
              </div>
              {error && (
                <p role="alert" className="type-small text-[#b42318]">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={pending}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#fdfdfd] text-[15px] font-semibold text-[#111] transition-colors duration-[400ms] ease-soft hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7dd3fc] disabled:opacity-60"
              >
                {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                验证并留言
              </button>
              <p className="type-caption text-[#6b7280]">
                没有订单号（还没买过，或在合作平台付款的）？
                <Link href="/support" className="text-link underline-offset-2 hover:underline">
                  去售后页留言
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
