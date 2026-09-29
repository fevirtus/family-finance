import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { Me } from "@/lib/types";

export default async function Home() {
  const me = await apiFetch<Me>("/me");
  const target = me.default_group_id ?? me.groups[0]?.id;
  redirect(target ? `/g/${target}/overview` : "/onboarding");
}
