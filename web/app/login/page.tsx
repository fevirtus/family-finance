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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Family Finance</h1>
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Đăng nhập thất bại hoặc email chưa được cho phép.
        </p>
      )}
      <LoginButton callbackUrl={safeCallback(callbackUrl)} />
    </main>
  );
}
