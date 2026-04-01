import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: "admin" | "nurse";
    };
  }

  interface User {
    role: "admin" | "nurse";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "admin" | "nurse";
  }
}
