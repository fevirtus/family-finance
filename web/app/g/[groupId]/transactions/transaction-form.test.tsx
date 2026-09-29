import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Account, Category } from "@/lib/types";
import { TransactionForm } from "./transaction-form";

const accounts: Account[] = [
  { id: "a1", name: "TPBank", kind: "bank", provider: "tpbank", owner_user_id: null, archived: false },
  { id: "a2", name: "Ví cũ", kind: "cash", provider: null, owner_user_id: null, archived: true },
];
const categories: Category[] = [
  { id: "c1", name: "Ăn uống", kind: "expense", icon: "🍜", parent_id: null, archived: false },
  { id: "c2", name: "Lương", kind: "income", icon: "💼", parent_id: null, archived: false },
];

function setup(action = vi.fn().mockResolvedValue({})) {
  render(
    <TransactionForm accounts={accounts} categories={categories} submitLabel="Lưu" action={action} />,
  );
  return { action, user: userEvent.setup() };
}

describe("TransactionForm", () => {
  it("submits an expense as a negative amount in VN time", async () => {
    const { action, user } = setup();
    await user.type(screen.getByLabelText("Số tiền"), "45k");
    await user.selectOptions(screen.getByLabelText("Danh mục"), "c1");
    fireEvent.change(screen.getByLabelText("Thời gian"), { target: { value: "2026-09-29T12:30" } });
    await user.type(screen.getByLabelText("Mô tả"), "Phở");
    await user.click(screen.getByRole("button", { name: "Lưu" }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({
        account_id: "a1",
        amount: -45_000,
        occurred_at: "2026-09-29T12:30:00+07:00",
        description: "Phở",
        category_id: "c1",
        note: null,
      }),
    );
  });

  it("switches to income: positive amount and only income categories", async () => {
    const { action, user } = setup();
    await user.click(screen.getByRole("button", { name: "Thu" }));
    const categorySelect = screen.getByLabelText("Danh mục");
    expect(categorySelect).toHaveTextContent("Lương");
    expect(categorySelect).not.toHaveTextContent("Ăn uống");

    await user.type(screen.getByLabelText("Số tiền"), "20tr");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][0].amount).toBe(20_000_000);
  });

  it("hides archived accounts", () => {
    setup();
    expect(screen.getByLabelText("Tài khoản")).not.toHaveTextContent("Ví cũ");
  });

  it("rejects an invalid amount without calling the action", async () => {
    const { action, user } = setup();
    await user.type(screen.getByLabelText("Số tiền"), "abc");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Số tiền không hợp lệ")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("shows the API error message", async () => {
    const { user } = setup(vi.fn().mockResolvedValue({ error: "Category kind does not match amount sign" }));
    await user.type(screen.getByLabelText("Số tiền"), "10k");
    await user.click(screen.getByRole("button", { name: "Lưu" }));
    expect(await screen.findByText("Category kind does not match amount sign")).toBeInTheDocument();
  });
});
