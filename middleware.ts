import { withAuth } from "next-auth/middleware";

export default withAuth();

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
