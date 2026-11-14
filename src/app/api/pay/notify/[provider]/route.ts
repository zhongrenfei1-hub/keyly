import { handleNotify } from "@/lib/payment";

// 支付平台的异步通知打到这里：/api/pay/notify/<渠道 id>
export async function POST(
  req: Request,
  { params }: RouteContext<"/api/pay/notify/[provider]">,
) {
  return handleNotify((await params).provider, req);
}
