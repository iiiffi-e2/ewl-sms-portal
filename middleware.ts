import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyEmbedResponseHeadersToNextResponse, isEmbedPath } from "@/lib/embed";

// Auth is enforced in server layouts/pages (getAuthSession) and API routes
// (requireSession). Avoid withAuth here: on Vercel Edge it can fail to read the
// same session cookie that Node route handlers accept, causing redirect loops.
export function middleware(req: NextRequest) {
  if (isEmbedPath(req.nextUrl.pathname)) {
    return applyEmbedResponseHeadersToNextResponse(NextResponse.next());
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/embed/:path*"],
};
