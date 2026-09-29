import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createGroup } from "./actions";
import { STARTER_ACCOUNTS } from "./presets";

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Tạo nhóm gia đình</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mời thành viên sau trong mục Thêm → Nhóm.
        </p>
      </div>
      <form action={createGroup} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="group-name">Tên nhóm</Label>
          <Input
            id="group-name"
            name="name"
            required
            maxLength={100}
            defaultValue="Nhà mình"
            className="h-12"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Tài khoản hay dùng</legend>
          <div className="flex flex-wrap gap-2">
            {STARTER_ACCOUNTS.map((p) => (
              <label
                key={p.key}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
              >
                <input
                  type="checkbox"
                  name="accounts"
                  value={p.key}
                  defaultChecked={p.key === "cash"}
                  className="sr-only"
                />
                {p.icon} {p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" className="h-12 w-full text-base">
          Bắt đầu
        </Button>
      </form>
    </main>
  );
}
