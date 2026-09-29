import type { AccountKind } from "@/lib/types";

export const STARTER_ACCOUNTS: {
  key: string;
  name: string;
  kind: AccountKind;
  provider: string | null;
  icon: string;
}[] = [
  { key: "cash", name: "Tiền mặt", kind: "cash", provider: null, icon: "💵" },
  { key: "tpbank", name: "TPBank", kind: "bank", provider: "tpbank", icon: "🏦" },
  { key: "momo", name: "MoMo", kind: "ewallet", provider: "momo", icon: "👛" },
  { key: "zalopay", name: "ZaloPay", kind: "ewallet", provider: "zalopay", icon: "👛" },
  { key: "shopeepay", name: "ShopeePay", kind: "ewallet", provider: "shopeepay", icon: "👛" },
  { key: "hsbc", name: "HSBC", kind: "bank", provider: "hsbc", icon: "🏦" },
];
