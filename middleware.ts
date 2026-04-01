import { withAuth } from "next-auth/middleware";

export default withAuth(
  function middleware() {
    return;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        if (!token) {
          return false;
        }

        const { pathname } = req.nextUrl;

        if (pathname.startsWith("/templates")) {
          return token.role === "admin";
        }

        if (
          pathname.startsWith("/api/templates") &&
          req.method !== "GET"
        ) {
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
    "/api/messages/:path*",
    "/api/conversations/:path*",
    "/api/contacts/:path*",
    "/api/templates/:path*",
    "/api/calls/:path*",
  ],
};
