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

export type ActionResult = { error?: string; id?: string };

export type TransactionPatch = Partial<TransactionInput>;

export type CategoryAmount = { category_id: string | null; amount: number; count: number };

export type Summary = {
  month: string;
  total_expense: number;
  total_income: number;
  prev_total_expense: number;
  prev_total_income: number;
  transaction_count: number;
  uncategorized_count: number;
  expense_by_category: CategoryAmount[];
  income_by_category: CategoryAmount[];
};

export type Suggestions = {
  expense_category_ids: string[];
  income_category_ids: string[];
  last_account_id: string | null;
};
