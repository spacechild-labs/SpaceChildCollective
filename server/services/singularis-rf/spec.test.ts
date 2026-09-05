import { describe, expect, it } from "vitest";
import { specJson, specMarkdown, specHtml } from "./spec";
import { BLOCK_CODES, decodeFrames, parseFrame, DEFAULT_FRAME_LENGTH } from "./codec";

describe("Singularis Compact spec", () => {
  const spec = specJson();

  it("documents every block the codec knows, with its fields and enum codes", () => {
    expect(Object.keys(spec.blocks).sort()).toEqual(Object.keys(BLOCK_CODES).sort());
    for (const b of Object.values(spec.blocks)) {
      expect(b.fields.length).toBeGreaterThan(0);
      for (const f of b.fields) if (f.kind === "enum" || f.kind === "enumlist") expect(Object.keys(f.codes ?? {}).length).toBeGreaterThan(1);
    }
    expect(spec.frame.crc).toContain("29B1");
  });

  it("ships worked examples whose frames decode back to the documented blocks and fit the default frame length", () => {
    expect(spec.examples.length).toBeGreaterThanOrEqual(2);
    for (const ex of spec.examples) {
      for (const f of ex.frames) { expect(f.length).toBeLessThanOrEqual(DEFAULT_FRAME_LENGTH); expect(parseFrame(f).crcOk).toBe(true); }
      expect(decodeFrames(ex.frames).blocks).toEqual(ex.blocks);
    }
  });

  it("renders Markdown and HTML that carry the grammar, the tables and the canonical link", () => {
    const md = specMarkdown();
    expect(md).toContain("FROM>TO:SP1 MM:S/N PAYLOAD #CCCC");
    expect(md).toContain("### `P` — GR::PONG");
    expect(md).toContain("| `s` | resonate |");
    expect(md).toContain("not intended to obscure meaning");
    const html = specHtml("https://research.spacechild.love");
    expect(html).toContain('<link rel="canonical" href="https://research.spacechild.love/spec/singularis-compact">');
    expect(html).toContain("<table>");
    expect(html).toContain("<pre><code>KANNAKA-PRIME&gt;AE0RM:SP1 7Q:1/");
    expect(html).not.toContain("<script");
  });
});
