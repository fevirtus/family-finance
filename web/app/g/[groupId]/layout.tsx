import Link from "next/link";
import { notFound } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { apiFetch } from "@/lib/api";
import type { Me } from "@/lib/types";

const NAV: [string, string][] = [
  ["transactions", "Giao dịch"],
  ["accounts", "Tài khoản"],
  ["categories", "Danh mục"],
  ["settings", "Cài đặt"],
];

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const me = await apiFetch<Me>("/me");
  const group = me.groups.find((g) => g.id === groupId);
  if (!group) notFound();

  return (
    <div className="mx-auto max-w-5xl p-4">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="font-semibold">{group.name}</div>
        <nav className="flex flex-wrap gap-4 text-sm">
          {NAV.map(([segment, label]) => (
            <Link key={segment} href={`/g/${groupId}/${segment}`} className="hover:underline">
              {label}
            </Link>
          ))}
        </nav>
        <SignOutButton />
      </header>
      {children}
    </div>
  );
}
