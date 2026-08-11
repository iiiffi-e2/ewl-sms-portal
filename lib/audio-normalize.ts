import { execFile } from "node:child_process";
import { mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import { VOICE_CONTENT_TYPE, VOICE_FILENAME } from "@/lib/voice-messages";

const execFileAsync = promisify(execFile);

export function looksLikeMp4Container(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.toString("ascii", 4, 8) === "ftyp";
}

async function convertWithFfmpeg(inputPath: string, outputPath: string): Promise<void> {
  if (!ffmpegPath) {
    throw new Error("Failed to convert audio to M4A.");
  }

  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-vn",
      outputPath,
    ]);
  } catch {
    throw new Error("Failed to convert audio to M4A.");
  }
}

export async function normalizeToM4a(input: {
  data: Buffer;
  contentType?: string | null;
  filename?: string | null;
}): Promise<{ data: Buffer; contentType: string; filename: string }> {
  if (looksLikeMp4Container(input.data)) {
    return {
      data: input.data,
      contentType: VOICE_CONTENT_TYPE,
      filename: VOICE_FILENAME,
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "audio-normalize-"));
  const inputPath = join(tempDir, "input");
  const outputPath = join(tempDir, "output.m4a");

  try {
    await writeFile(inputPath, input.data);
    await convertWithFfmpeg(inputPath, outputPath);
    const data = await readFile(outputPath);
    return {
      data,
      contentType: VOICE_CONTENT_TYPE,
      filename: VOICE_FILENAME,
    };
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}
