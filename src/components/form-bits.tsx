import { Container } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** 一个带标签和说明的输入框 */
export function Field({
  label,
  hint,
  mono,
  className,
  ...props
}: React.ComponentProps<"input"> & { label: string; hint?: string; mono?: boolean }) {
  const id = props.id ?? props.name;
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="type-small font-semibold">
        {label}
      </Label>
      <Input
        id={id}
        {...props}
        className={cn(
          "h-12 rounded-[16px] bg-background px-4 text-[17px] transition-all duration-[400ms] ease-soft md:text-[17px]",
          mono && "font-mono",
          className,
        )}
      />
      {hint && <p className="type-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 前台单表单页面（查订单、兑换、售后）共用的版式：居中的窄栏，衬线大标题，一句说明，下面一张白色实心卡装表单 */
export function FormPage({
  title,
  desc,
  hand,
  children,
}: {
  title: string;
  desc: string;
  /** 标题上面一行手写英文，和页脚同一套字体。中文标题仍是正式的字。 */
  hand?: string;
  children: React.ReactNode;
}) {
  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-[440px]">
        {hand && (
          <p className="mb-1 text-center font-hand text-[32px] leading-none text-link">{hand}</p>
        )}
        <h1 className="text-center type-serif type-title text-balance sm:type-headline">
          {title}
        </h1>
        <p className="mt-3 mb-9 text-center type-body text-pretty text-muted-foreground">
          {desc}
        </p>
        <div className="card-solid p-5 sm:p-8">{children}</div>
      </div>
    </Container>
  );
}
