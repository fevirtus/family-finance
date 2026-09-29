import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Account, Category, Suggestions, Transaction } from "@/lib/types";
import { TransactionForm } from "./transaction-form";

const accounts: Account[] = [
  { id: "a1", name: "TPBank", kind: "bank", provider: "tpbank", owner_user_id: null, archived: false },
  { id: "a2", name: "MoMo", kind: "ewallet", provider: "momo", owner_user_id: null, archived: false },
  { id: "a3", name: "Ví cũ", kind: "cash", provider: null, owner_user_id: null, archived: true },
];
const categories: Category[] = [
  { id: "c1", name: "Ăn uống", kind: "expense", icon: "🍜", parent_id: null, archived: false },
  { id: "c2", name: "Đi chợ", kind: "expense", icon: "🛒", parent_id: null, archived: false },
  { id: "c3", name: "Du lịch", kind: "expense", icon: "✈️", parent_id: null, archived: false },
  { id: "c9", name: "Lương", kind: "income", icon: "💼", parent_id: null, archived: false },
];
const suggestions: Suggestions = {
  expense_category_ids: ["c1", "c2"],
  income_category_ids: ["c9"],
  last_account_id: "a2",
};

function setup(props: Partial<React.ComponentProps<typeof TransactionForm>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue({});
  render(
    <TransactionForm
      accounts={accounts}
      categories={categories}
      suggestions={suggestions}
      defaultAccountId="a2"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, user: userEvent.setup({ pointerEventsCheck: 0 }) };
}

describe("TransactionForm (create)", () => {
  it("submits an expense with the default account and chosen category", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText("Số tiền"), "45k");
    expect(screen.getByText("= 45.000 đ")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ăn uống/ }));
    fireEvent.change(screen.getByLabelText("Thời gian"), { target: { value: "2026-09-29T12:30" } });
    await user.type(screen.getByLabelText("Mô tả"), "Phở");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        account_id: "a2",
        amount: -45_000,
        occurred_at: "2026-09-29T12:30:00+07:00",
        description: "Phở",
        category_id: "c1",
        note: null,
      }),
    );
  });

  it("amount chips set the amount", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "50k" }));
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(onSubmit.mock.calls[0][0].amount).toBe(-50_000));
  });

  it("income mode shows only income categories and submits a positive amount", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Thu" }));
    expect(screen.queryByRole("button", { name: /Ăn uống/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Lương/ }));
    await user.type(screen.getByLabelText("Số tiền"), "20tr");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() =>
      expect(onSubmit.mock.calls[0][0]).toMatchObject({ amount: 20_000_000, category_id: "c9" }),
    );
  });

  it("'Khác…' lists all categories of the kind and picking one selects it", async () => {
    const { onSubmit, user } = setup();
    expect(screen.queryByRole("button", { name: /Du lịch/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Khác…" }));
    await user.click(screen.getByRole("button", { name: /Du lịch/ }));
    await user.type(screen.getByLabelText("Số tiền"), "1tr");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(onSubmit.mock.calls[0][0].category_id).toBe("c3"));
  });

  it("account pill switches account and hides archived ones", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Tài khoản" }));
    expect(screen.queryByRole("button", { name: /Ví cũ/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /TPBank/ }));
    await user.type(screen.getByLabelText("Số tiền"), "10k");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(onSubmit.mock.calls[0][0].account_id).toBe("a1"));
  });

  it("rejects an invalid amount and shows API errors in place", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ error: "Category kind does not match amount sign" });
    const { user } = setup({ onSubmit });
    await user.type(screen.getByLabelText("Số tiền"), "abc");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Số tiền không hợp lệ")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("Số tiền"));
    await user.type(screen.getByLabelText("Số tiền"), "10k");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Category kind does not match amount sign")).toBeInTheDocument();
  });

  it("with no usable account it asks to add one instead of submitting", async () => {
    const onNeedAccount = vi.fn();
    const { onSubmit, user } = setup({ accounts: [accounts[2]], defaultAccountId: null, onNeedAccount });
    expect(screen.getByText("Bạn cần thêm tài khoản trước")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Thêm tài khoản" }));
    expect(onNeedAccount).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Lưu" })).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("TransactionForm (edit)", () => {
  const initial: Transaction = {
    id: "t1", account_id: "a1", user_id: "u1", amount: -45_000,
    occurred_at: "2026-09-29T05:30:00Z", description: "Phở", merchant: null, counterparty: null,
    category_id: "c3", source: "web", status: "confirmed", classified_by: "user",
    is_internal_transfer: false, reconciled: false, note: null,
    created_at: "2026-09-29T05:30:00Z", updated_at: "2026-09-29T05:30:00Z",
  };

  it("prefills values, keeps a non-suggested category visible, and saves", async () => {
    const { onSubmit, user } = setup({ initial });
    expect(screen.getByLabelText("Số tiền")).toHaveValue("45000");
    expect(screen.getByRole("button", { name: /Du lịch/ })).toHaveAttribute("aria-pressed", "true");
    await user.type(screen.getByLabelText("Ghi chú"), "ăn sáng");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(onSubmit.mock.calls[0][0]).toMatchObject({
        account_id: "a1",
        amount: -45_000,
        occurred_at: "2026-09-29T12:30:00+07:00",
        category_id: "c3",
        note: "ăn sáng",
      }),
    );
  });

  it("asks for confirmation before deleting", async () => {
    const onDelete = vi.fn().mockResolvedValue({});
    const { user } = setup({ initial, onDelete });
    await user.click(screen.getByRole("button", { name: "Xoá giao dịch" }));
    expect(await screen.findByText("Xoá giao dịch -45.000 đ?")).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Xoá" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });
});
