import { type NextRequest, NextResponse } from "next/server";

/** Expose the requested path to server components so auth redirects can come back to it. */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|manifest.webmanifest|favicon.ico).*)"],
};
