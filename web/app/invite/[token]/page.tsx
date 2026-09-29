import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch, getApiToken } from "@/lib/api";
import type { InvitePreview } from "@/lib/types";
import { acceptInvite } from "./actions";

function Message({ text }: { text: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center justify-center p-6 text-center text-sm text-muted-foreground">
      {text}
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!(await getApiToken())) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  let preview: InvitePreview;
  try {
    preview = await apiFetch<InvitePreview>(`/invites/${encodeURIComponent(token)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return <Message text="Link mời không tồn tại." />;
    throw e;
  }
  if (preview.already_member) redirect(`/g/${preview.group_id}/overview`);
  if (!preview.valid) return <Message text="Link mời đã hết hạn hoặc đã được sử dụng." />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6 text-center">
      <h1 className="text-xl font-semibold">Tham gia nhóm “{preview.group_name}”</h1>
      <form action={acceptInvite.bind(null, token)}>
        <Button type="submit" className="h-12 w-full text-base">
          Tham gia
        </Button>
      </form>
    </main>
  );
}
