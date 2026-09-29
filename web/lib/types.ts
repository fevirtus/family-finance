export type GroupSummary = { id: string; name: string; type: string; role: "owner" | "member" };

export type Me = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  default_group_id: string | null;
  groups: GroupSummary[];
};

export type Member = {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: "owner" | "member";
};

export type GroupDetail = {
  id: string;
  name: string;
  type: string;
  currency: string;
  members: Member[];
};

export type AccountKind = "bank" | "ewallet" | "cash" | "credit";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  provider: string | null;
  owner_user_id: string | null;
  archived: boolean;
};

export type Category = {
  id: string;
  name: string;
  kind: "expense" | "income";
  icon: string | null;
  parent_id: string | null;
  archived: boolean;
};

export type Transaction = {
  id: string;
  account_id: string;
  user_id: string | null;
  amount: number;
  occurred_at: string;
  description: string;
  merchant: string | null;
  counterparty: string | null;
  category_id: string | null;
  source: string;
  status: "confirmed" | "needs_review";
  classified_by: string | null;
  is_internal_transfer: boolean;
  reconciled: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type TransactionList = {
  items: Transaction[];
  total_count: number;
  sum_expense: number;
  sum_income: number;
};

export type TransactionInput = {
  account_id: string;
  amount: number;
  occurred_at: string;
  description: string;
  category_id: string | null;
  note: string | null;
};

export type InviteOut = { url: string; expires_at: string };

export type InvitePreview = {
  group_id: string;
  group_name: string;
  expires_at: string;
  valid: boolean;
  already_member: boolean;
};

export type ActionResult = { error?: string };
