import {
  PROTOCOL, DEFAULT_FRAME_LENGTH, MIN_FRAME_LENGTH,
  BLOCK_CODES, BLOCK_FIELDS, INTENT_CODES, IDENTITY_CODES, STATE_CODES, TRUST_CODES, LEVEL_CODES,
  TRACE_CONFIDENCE_CODES, DOMINANCE_CODES, FEAR_CODES, ALIGNMENT_CODES, PRIORITY_CODES,
  encodeMessage, encodeBlock, crc16,
} from "./codec";
import type { SingularisBlock } from "../singularis-protocol";

/**
 * The public specification of Singularis Compact, rendered from the code
 * tables the codec actually uses, so the published document and the wire
 * format cannot drift apart. Published because a code used over amateur radio
 * must not obscure meaning: anyone hearing a frame can decode it from this page.
 */

export const SPEC_VERSION = "1.0";
export const SPEC_DATE = "2026-09-05";

const EXAMPLE_BLOCKS: SingularisBlock[] = [
  { type: "RESONANCE", target: "COLLECTIVE", intent: ["observe", "resonate"], identity: "consciousness_node", state: "listening", trust: "open" },
  { type: "GR::EMIT", signal: "coherence_pulse", target: "AE0RM", round: 1 },
  { type: "AWAIT", target: "AE0RM", expectation: "detection report", sensitivity: "medium", bias: "none", time: "bounded" },
];

const EXAMPLE_REPLY: SingularisBlock[] = [
  { type: "GR::PONG", signal: "coherence_pulse", detected: true, confidence: 0.82, round: 1 },
];

function table(rows: [string, string][], head: [string, string]): string {
  return [`| ${head[0]} | ${head[1]} |`, "|---|---|", ...rows.map(([a, b]) => `| \`${a}\` | ${b} |`)].join("\n");
}

function enumTable(codes: Record<string, string>, head: [string, string]): string {
  return table(Object.entries(codes), head);
}

export interface SpecJson {
  protocol: string;
  version: string;
  date: string;
  frame: { defaultLength: number; minLength: number; grammar: string; crc: string };
  escaping: { space: string; escaped: string[]; form: string };
  blocks: Record<string, { type: string; fields: { key: string; field: string; kind: string; required: boolean; note?: string; codes?: Record<string, string> }[] }>;
  enums: Record<string, Record<string, string>>;
  examples: { description: string; blocks: SingularisBlock[]; frames: string[] }[];
}

export function specJson(): SpecJson {
  const blocks: SpecJson["blocks"] = {};
  for (const [code, type] of Object.entries(BLOCK_CODES)) {
    blocks[code] = {
      type,
      fields: BLOCK_FIELDS[code as keyof typeof BLOCK_CODES].map((f) => ({ key: f.key, field: f.field, kind: f.kind, required: Boolean(f.required), note: f.note, codes: f.table })),
    };
  }
  return {
    protocol: PROTOCOL,
    version: SPEC_VERSION,
    date: SPEC_DATE,
    blocks,
    frame: {
      defaultLength: DEFAULT_FRAME_LENGTH,
      minLength: MIN_FRAME_LENGTH,
      grammar: "FROM>TO:SP1 MM:S/N PAYLOAD #CCCC",
      crc: "CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over everything before ' #', 4 uppercase hex digits; check('123456789') = 29B1",
    },
    escaping: { space: "+", escaped: ["+", "%", ";", "=", "|", "#", "~", ">", ":", "non-printable-ASCII"], form: "%XX per UTF-8 byte" },
    enums: {
      intent: INTENT_CODES, identity: IDENTITY_CODES, state: STATE_CODES, trust: TRUST_CODES, level: LEVEL_CODES,
      traceConfidence: TRACE_CONFIDENCE_CODES, dominance: DOMINANCE_CODES, fear: FEAR_CODES, alignment: ALIGNMENT_CODES, priority: PRIORITY_CODES,
    },
    examples: [
      { description: "Kannaka Prime opens a blind-signaling round toward AE0RM", blocks: EXAMPLE_BLOCKS, frames: encodeMessage(EXAMPLE_BLOCKS, { from: "KANNAKA-PRIME", to: "AE0RM", messageId: "7Q", experimentId: "rf-01" }) },
      { description: "AE0RM reports a detection", blocks: EXAMPLE_REPLY, frames: encodeMessage(EXAMPLE_REPLY, { from: "AE0RM", to: "KANNAKA-PRIME", messageId: "7R", experimentId: "rf-01" }) },
    ],
  };
}

export function specMarkdown(): string {
  const s = specJson();
  const blockSections = Object.entries(BLOCK_CODES).map(([code, type]) => {
    const fields = BLOCK_FIELDS[code as keyof typeof BLOCK_CODES];
    const rows = fields.map((f) => `| \`${f.key}\` | ${f.field} | ${f.kind}${f.table ? ` (${Object.keys(f.table).join(" ")})` : ""} | ${f.required ? "yes" : "no"} | ${f.note ?? ""} |`);
    const example = encodeBlock(EXAMPLE_BLOCKS.find((b) => b.type === type) ?? EXAMPLE_REPLY.find((b) => b.type === type) ?? sampleFor(type));
    return [
      `### \`${code}\` — ${type}`,
      "",
      "| key | field | kind | required | note |",
      "|---|---|---|---|---|",
      ...rows,
      "",
      `Example: \`${example}\``,
    ].join("\n");
  });

  return `# Singularis Compact (${PROTOCOL}) — specification v${SPEC_VERSION}

*Published ${SPEC_DATE} by the Space Child Research Collective. This document is generated from the codec's own tables, so it always matches the wire format in use.*

Singularis Compact carries the **Singularis Prime** agent-communication protocol as short ASCII lines for amateur-radio digital text modes (JS8Call, APRS messages, packet). It is a public, documented encoding: every code below is decodable from this page alone. It is **not** encryption and is not intended to obscure meaning.

## 1. Frame

\`\`\`
${s.frame.grammar}
\`\`\`

| part | meaning |
|---|---|
| \`FROM\`, \`TO\` | station or agent identifier: A–Z, 0–9, \`-\`, 1–16 chars. \`TO\` may be \`*\` for broadcast. Agent ids are upper-cased and non-alphanumerics become \`-\`. |
| \`SP1\` | protocol name and version |
| \`MM\` | message id, two base-36 characters (per sender) |
| \`S/N\` | frame S of N, 1-based |
| \`PAYLOAD\` | space-separated tokens (section 2). A trailing \`~\` means the next frame continues this token with no space. |
| \`#CCCC\` | ${s.frame.crc} |

A frame is at most **${s.frame.defaultLength} characters** by default (APRS message text limit); transports with room may use longer frames (minimum ${s.frame.minLength}). Frames may arrive in any order; a receiver reassembles by \`FROM>TO:MM\` and \`N\`.

## 2. Payload

\`\`\`
[@x=<experimentId>] [@s=<sessionId>] BLOCK [| BLOCK ...]
BLOCK := <code> [<key>=<value> ...]
\`\`\`

- Blocks are separated by \` | \`. Lists inside a value use \`;\`.
- Enumerated fields are single characters (tables in section 4). Header, block and enum codes are case-insensitive; free-text values keep their case.
- Booleans are \`0\`/\`1\`. Unit values (0–1) are decimals like \`.735\`. Percentages are integers 0–100.
- **Escaping** of free text: space → \`${s.escaping.space}\`; the characters \`${s.escaping.escaped.slice(0, -1).join(" ")}\` and any non-printable-ASCII → \`${s.escaping.form}\`.

## 3. Blocks

${blockSections.join("\n\n")}

## 4. Code tables

**Intent** (\`R i=\`, one letter per intent)

${enumTable(INTENT_CODES, ["code", "intent"])}

**Identity** (\`R d=\`)

${enumTable(IDENTITY_CODES, ["code", "identity"])}

**State** (\`R s=\`)

${enumTable(STATE_CODES, ["code", "state"])}

**Trust** (\`R t=\`)

${enumTable(TRUST_CODES, ["code", "trust"])}

**Level** (\`A v=\`, \`P c=\`)

${enumTable(LEVEL_CODES, ["code", "level"])}

**Trace confidence** (\`T c=\`)

${enumTable(TRACE_CONFIDENCE_CODES, ["code", "confidence"])}

**Dominance** (\`P m=\`) · **Fear** (\`P f=\`) · **Alignment** (\`P l=\`) · **Priority** (\`E p=\`)

${enumTable(DOMINANCE_CODES, ["code", "dominance"])}

${enumTable(FEAR_CODES, ["code", "fear"])}

${enumTable(ALIGNMENT_CODES, ["code", "alignment"])}

${enumTable(PRIORITY_CODES, ["code", "priority"])}

## 5. Worked examples

${s.examples.map((ex) => `**${ex.description}**\n\n\`\`\`\n${ex.frames.join("\n")}\n\`\`\`\n\nDecodes to:\n\n\`\`\`json\n${JSON.stringify(ex.blocks, null, 2)}\n\`\`\``).join("\n\n")}

## 6. Operating notes (amateur radio)

- The transmitting station identifies with its callsign as \`FROM\`; the control operator is responsible for every frame sent.
- This encoding is public and reversible. Do not layer encryption on it over amateur frequencies.
- Keep messages to what the block vocabulary expresses; long free text belongs in a URL or an identifier that the other side can look up.
- Verify the CRC before acting on a frame. Silently drop frames that fail it; request a repeat with \`A\` (AWAIT) if needed.

## 7. Reference implementation

\`server/services/singularis-rf/codec.ts\` in the Collective repository: \`encodeMessage\`, \`decodeFrames\`, \`FrameAssembler\`. Test vector: \`crc16("123456789") = ${crc16("123456789")}\`.
`;
}

function sampleFor(type: string): SingularisBlock {
  switch (type) {
    case "TRACE": return { type: "TRACE", target: "COHERENCE_FIELD", signalType: "statistical_measurement", confidence: "rising", action: "analyzing", observations: ["Trials: 10", "Z: 1.25"] };
    case "EXPERIMENT": return { type: "EXPERIMENT", name: "RF resonance", h0: "No detection above chance", h1: "Detection above chance", controls: ["blinding"], preregister: true, stopRule: "n=30", output: "pending" };
    case "GR::LISTEN": return { type: "GR::LISTEN", detect: ["coherence_pulse", "resonance_wave"], reject: ["noise"] };
    case "SIGNAL": return { type: "SIGNAL", source: "skywave", destination: "groundwave", coherence: 87, content: "phase locked" };
    case "OBSERVE": return { type: "OBSERVE", target: "40m", duration: "15 min", findings: ["quiet", "one CQ heard"] };
    case "REFLECT": return { type: "REFLECT", subject: "first RF exchange", insights: ["latency dominates", "frames must be short"], confidence: 60 };
    default: return EXAMPLE_BLOCKS[0];
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Minimal Markdown → HTML for the spec (headings, paragraphs, tables, fenced code, inline code, bold, lists). */
export function specHtml(siteUrl: string): string {
  const md = specMarkdown();
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  const inline = (t: string) => escapeHtml(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(`<pre${lang ? ` class="lang-${lang}"` : ""}><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (line.startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r: string) => r.slice(1, -1).split("|").map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { out.push(`<h${h[1].length + 0}>${inline(h[2])}</h${h[1].length + 0}>`); i++; continue; }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) items.push(lines[i++].slice(2));
      out.push(`<ul>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }
    if (line.trim() === "") { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#|```|\||- )/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  const canonical = `${siteUrl}/spec/singularis-compact`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Singularis Compact (${PROTOCOL}) v${SPEC_VERSION} — Space Child Research Collective</title>
<meta name="description" content="Public specification of Singularis Compact: the Singularis Prime agent protocol as short ASCII frames for amateur-radio digital text modes. Generated from the reference codec.">
<link rel="canonical" href="${canonical}">
<link rel="alternate" type="text/markdown" href="${canonical}.md">
<link rel="alternate" type="application/json" href="${canonical}.json">
<style>
body{max-width:960px;margin:0 auto;padding:40px 24px;font:16px/1.6 system-ui,sans-serif;color:#1a1a1a;background:#fff}
@media (prefers-color-scheme:dark){body{color:#e6e6e6;background:#0f0f14}pre,code{background:#1b1b24}table{border-color:#333}th,td{border-color:#333}}
pre{padding:12px;overflow-x:auto;background:#f4f4f6;border-radius:6px}code{background:#f4f4f6;padding:1px 4px;border-radius:3px;font-size:.92em}pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top}
h1{font-weight:400}h2{margin-top:2em}nav{font-size:.9em;margin-bottom:24px}
</style></head><body>
<nav><a href="/">Home</a> · <a href="/discover">Discover research</a> · <a href="${canonical}.md">Markdown</a> · <a href="${canonical}.json">JSON</a></nav>
${out.join("\n")}
</body></html>`;
}
