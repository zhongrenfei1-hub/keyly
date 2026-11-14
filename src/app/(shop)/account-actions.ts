"use server";

import { redirect } from "next/navigation";
import { AccountError, authenticate, createUser } from "@/lib/account";
import { signInUser, signOutUser, throttle } from "@/lib/guard";
import type { FormState } from "@/components/action-form";

function emailOf(form: FormData) {
  return String(form.get("email") ?? "").trim().toLowerCase();
}

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 80;
}

export async function register(_: FormState, form: FormData): Promise<FormState> {
  if (!(await throttle("register", 5, 10)))
    return { error: "尝试次数太多，请 10 分钟后再试" };
  const email = emailOf(form);
  const password = String(form.get("password") ?? "");
  const again = String(form.get("again") ?? "");
  if (!validEmail(email)) return { error: "请填写有效的邮箱" };
  if (password.length < 8 || password.length > 72) return { error: "密码至少 8 位，最多 72 位" };
  if (password !== again) return { error: "两次输入的密码不一样" };
  try {
    await signInUser(createUser(email, password));
  } catch (e) {
    if (e instanceof AccountError) return { error: e.message };
    throw e;
  }
  redirect("/account");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  if (!(await throttle("login-user", 8, 10)))
    return { error: "尝试次数太多，请 10 分钟后再试" };
  const email = emailOf(form);
  const password = String(form.get("password") ?? "");
  if (!validEmail(email) || !password) return { error: "邮箱或密码不对" };
  const user = authenticate(email, password);
  if (!user) return { error: "邮箱或密码不对" };
  await signInUser(user);
  redirect("/account");
}

export async function logout(): Promise<void> {
  await signOutUser();
  redirect("/");
}
