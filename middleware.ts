import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import {
  applyEmbedResponseHeadersToNextResponse,
  buildEmbedLoginUrl,
  isEmbedPath,
} from "@/lib/embed";

export default withAuth(
  function middleware(req) {
    const { pathname, search } = req.nextUrl;
    const callbackPath = `${pathname}${search}`;

    if (isEmbedPath(pathname) && pathname !== "/embed/login" && !req.nextauth.token) {
      const redirect = NextResponse.redirect(new URL(buildEmbedLoginUrl(callbackPath), req.url));
      return applyEmbedResponseHeadersToNextResponse(redirect);
    }

    const response = NextResponse.next();
    if (isEmbedPath(pathname)) {
      return applyEmbedResponseHeadersToNextResponse(response);
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        if (pathname.startsWith("/embed/login")) {
          return true;
        }

        if (isEmbedPath(pathname)) {
          return true;
        }

        if (!token) {
          return false;
        }

        if (pathname.startsWith("/templates")) {
          return token.role === "admin";
        }

        if (pathname.startsWith("/api/templates") && req.method !== "GET") {
          return token.role === "admin";
        }

        return true;
      },
    },
  },
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/templates/:path*",
    "/contacts/:path*",
    "/conversations/:path*",
    "/embed/:path*",
    "/api/messages/:path*",
    "/api/conversations/:path*",
    "/api/contacts/:path*",
    "/api/templates/:path*",
    "/api/calls/:path*",
    "/api/voice/:path*",
  ],
};
