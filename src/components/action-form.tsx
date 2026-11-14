"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Server Action 返回给表单的结果：出错给 error，成功要提示就给 ok */
export type FormState = { error?: string; ok?: string } | null;

type ButtonProps = React.ComponentProps<typeof Button>;

/**
 * 全站表单的统一外壳：包住字段，负责提交、转圈、显示报错和成功提示。
 * 出错时保留用户已经填的内容，成功且有提示时清空表单。
 */
export function ActionForm({
  action,
  submit,
  children,
  className,
  variant = "default",
  size = "lg",
  buttonClassName,
  disabled,
  confirm,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submit: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  buttonClassName?: string;
  disabled?: boolean;
  /** 填了就在提交前弹确认框，用在删除、退款这类不好撤回的操作上 */
  confirm?: string;
}) {
  const [state, run, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      action={run}
      // 自己接管提交：React 默认会在 action 结束后清空表单，出错时不该清
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => run(data));
      }}
      className={cn("space-y-4", className)}
    >
      {children}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="text-sm text-success">
          {state.ok}
        </p>
      )}
      <Button
        type="submit"
        variant={variant}
        size={size}
        disabled={disabled || pending}
        className={buttonClassName}
      >
        {pending && <LoaderCircle className="animate-spin" />}
        {submit}
      </Button>
    </form>
  );
}
