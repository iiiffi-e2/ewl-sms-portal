import { describe, expect, it } from "vitest";
import {
  EMBED_INBOX_PATH,
  EMBED_LOGIN_PATH,
  applyEmbedResponseHeaders,
  buildEmbedLoginUrl,
} from "@/lib/embed";

describe("embed helpers", () => {
  it("builds embed login url with callback", () => {
    expect(buildEmbedLoginUrl("/embed/inbox")).toBe("/embed/login?callbackUrl=%2Fembed%2Finbox");
    expect(buildEmbedLoginUrl("/embed/inbox?conversationId=abc")).toBe(
      "/embed/login?callbackUrl=%2Fembed%2Finbox%3FconversationId%3Dabc",
    );
  });

  it("sets frame-ancestors header", () => {
    const response = new Response(null, { status: 200 });
    applyEmbedResponseHeaders(response);
    expect(response.headers.get("Content-Security-Policy")).toBe("frame-ancestors *");
  });

  it("exports stable paths", () => {
    expect(EMBED_LOGIN_PATH).toBe("/embed/login");
    expect(EMBED_INBOX_PATH).toBe("/embed/inbox");
  });
});
