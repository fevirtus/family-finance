import { btnCls, inputCls } from "@/lib/ui";
import { createGroup } from "./actions";

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Tạo nhóm gia đình</h1>
      <p className="text-sm text-neutral-500">Tạo nhóm rồi mời thành viên sau trong Cài đặt.</p>
      <form action={createGroup} className="flex flex-col gap-3">
        <input name="name" required maxLength={100} placeholder="VD: Nhà mình" className={inputCls} />
        <button className={btnCls}>Tạo nhóm</button>
      </form>
    </main>
  );
}
