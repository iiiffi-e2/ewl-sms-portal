import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { createVoiceAccessToken, VOICE_TOKEN_TTL_SECONDS } from "@/lib/voice/token";

export async function GET() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const token = createVoiceAccessToken(authResult.session.user.id);
    return NextResponse.json({ token, expiresIn: VOICE_TOKEN_TTL_SECONDS });
  } catch (error) {
    console.error("Failed to create voice token:", error);
    return NextResponse.json({ error: "Voice calling is not configured." }, { status: 503 });
  }
}
