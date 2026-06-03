import { NextResponse } from "next/server";

export const EMBED_LOGIN_PATH = "/embed/login";
export const EMBED_INBOX_PATH = "/embed/inbox";
export const EMBED_FRAME_ANCESTORS = "*";

export function buildEmbedLoginUrl(callbackUrl: string): string {
  const params = new URLSearchParams({ callbackUrl });
  return `${EMBED_LOGIN_PATH}?${params.toString()}`;
}

export function applyEmbedResponseHeaders(response: Response): Response {
  response.headers.set("Content-Security-Policy", `frame-ancestors ${EMBED_FRAME_ANCESTORS}`);
  return response;
}

export function applyEmbedResponseHeadersToNextResponse(response: NextResponse): NextResponse {
  response.headers.set("Content-Security-Policy", `frame-ancestors ${EMBED_FRAME_ANCESTORS}`);
  return response;
}

export function isEmbedPath(pathname: string): boolean {
  return pathname.startsWith("/embed/");
}
