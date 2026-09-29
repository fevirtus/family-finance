import { LoginButton } from "./login-button";

function safeCallback(url?: string): string {
  return url && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 p-6">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
          đ
        </div>
        <h1 className="text-2xl font-semibold">Family Finance</h1>
        <p className="text-sm text-muted-foreground">
          Theo dõi chi tiêu gia đình — nhanh, gọn, trên mọi thiết bị.
        </p>
      </div>
      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-center text-sm text-destructive">
          Đăng nhập thất bại hoặc email chưa được cho phép.
        </p>
      )}
      <LoginButton callbackUrl={safeCallback(callbackUrl)} />
    </main>
  );
}
