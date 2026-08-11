import { describe, expect, it } from "vitest";
import { looksLikeMp4Container } from "@/lib/audio-normalize";

describe("looksLikeMp4Container", () => {
  it("detects ftyp at offset 4", () => {
    const buf = Buffer.alloc(12);
    buf.write("ftyp", 4, "ascii");
    expect(looksLikeMp4Container(buf)).toBe(true);
  });

  it("rejects non-mp4", () => {
    expect(looksLikeMp4Container(Buffer.from("ID3"))).toBe(false);
    expect(looksLikeMp4Container(Buffer.alloc(3))).toBe(false);
  });
});
