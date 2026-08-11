import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/messages/send-voice": ["./node_modules/ffmpeg-static/**/*"],
  },
};

export default nextConfig;
