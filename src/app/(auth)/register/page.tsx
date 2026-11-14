import { Suspense } from "react";
import { redirect } from "next/navigation";
import { BuyerAuthScreen } from "@/components/buyer-auth-screen";
import { currentUser } from "@/lib/guard";

export const metadata = { title: "注册" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Register />
    </Suspense>
  );
}

async function Register() {
  if (await currentUser()) redirect("/account");
  return <BuyerAuthScreen mode="register" />;
}
