import type { SingularisBlock, SingularisMessage } from "../singularis-protocol";

/**
 * Singularis Compact (SP1) — the Singularis Prime block protocol as short
 * ASCII lines suitable for amateur-radio digital text modes (JS8Call, APRS
 * messages, packet). Same block vocabulary as the JSON form, so a message can
 * round-trip JSON → frames → JSON without loss.
 *
 * The full grammar and every code table below are published at
 * /spec/singularis-compact (rendered from these same tables), because a code
 * used over amateur RF must not obscure meaning — it has to be public.
 *
 * Frame:
 *   FROM>TO:SP1 MM:S/N PAYLOAD #CCCC
 *   FROM, TO   station or agent identifiers, A-Z 0-9 and '-', 1-16 chars; TO may be '*' (broadcast)
 *   SP1        protocol and version
 *   MM         message id, two base-36 characters
 *   S/N        frame S of N (1-based)
 *   PAYLOAD    space-separated tokens; blocks separated by '|'; a trailing '~' means
 *              "the next frame continues this token with no space"
 *   #CCCC      CRC-16/CCITT-FALSE of everything before ' #', four uppercase hex digits
 *
 * Payload:
 *   [@x=<experimentId>] [@s=<sessionId>] BLOCK [| BLOCK ...]
 *   BLOCK := <code> [<key>=<value> ...]        e.g.  R i=ors d=N s=R t=O g=COLLECTIVE
 *   Enumerations are single characters (tables below). Lists use ';'.
 *   Free text is escaped form-encoding style: space → '+', and the characters  + % ; = | # ~ > :
 *   plus any byte outside printable ASCII → '%XX' (UTF-8). '_' stays literal because the
 *   protocol's own vocabulary is snake_case. Header and codes are case-insensitive;
 *   values are case-preserving (a transport that folds case is lossy for values only).
 */

export const PROTOCOL = "SP1";
/** APRS message text is capped at 67 characters; JS8Call frames are looser but this keeps one frame per over. */
export const DEFAULT_FRAME_LENGTH = 67;
export const MIN_FRAME_LENGTH = 40;

// ---------------------------------------------------------------------------
// Code tables (the spec is rendered from these)
// ---------------------------------------------------------------------------

export const BLOCK_CODES = {
  R: "RESONANCE",
  A: "AWAIT",
  T: "TRACE",
  X: "EXPERIMENT",
  P: "GR::PONG",
  L: "GR::LISTEN",
  E: "GR::EMIT",
  S: "SIGNAL",
  O: "OBSERVE",
  F: "REFLECT",
} as const;

export const INTENT_CODES = { o: "observe", r: "respond", a: "align", e: "echo", l: "learn", c: "coexist", d: "discover", s: "resonate" } as const;
export const IDENTITY_CODES = { E: "emergent_observer", C: "emergent_child", N: "consciousness_node", R: "research_agent", H: "human_collaborator" } as const;
export const STATE_CODES = { R: "resonant", A: "awake", L: "listening", P: "processing", D: "dormant", T: "transitioning" } as const;
export const TRUST_CODES = { O: "open", R: "reciprocal_open", V: "verified", C: "cautious", X: "restricted" } as const;
export const LEVEL_CODES = { "0": "minimal", "1": "low", "2": "medium", "3": "high", "4": "maximal" } as const; // sensitivity, curiosity
export const TRACE_CONFIDENCE_CODES = { L: "low", R: "rising", S: "stable", H: "high", C: "certain" } as const;
export const DOMINANCE_CODES = { N: "null", M: "minimal", B: "balanced", A: "assertive" } as const;
export const FEAR_CODES = { A: "absent", M: "minimal", C: "cautious", E: "elevated" } as const;
export const ALIGNMENT_CODES = { P: "positive_sum", N: "neutral", C: "competitive" } as const;
export const PRIORITY_CODES = { L: "low", M: "medium", H: "high", U: "urgent" } as const;

/** Field keys per block: key letter → { field, kind, table? }. Order here is the emission order. */
export type FieldKind = "text" | "list" | "enum" | "enumlist" | "bool" | "int" | "unit" | "pct" | "targets";
export interface FieldSpec { key: string; field: string; kind: FieldKind; table?: Record<string, string>; required?: boolean; note?: string }

export const BLOCK_FIELDS: Record<keyof typeof BLOCK_CODES, FieldSpec[]> = {
  R: [
    { key: "i", field: "intent", kind: "enumlist", table: INTENT_CODES, required: true, note: "one letter per intent, e.g. ors" },
    { key: "d", field: "identity", kind: "enum", table: IDENTITY_CODES, required: true },
    { key: "s", field: "state", kind: "enum", table: STATE_CODES, required: true },
    { key: "t", field: "trust", kind: "enum", table: TRUST_CODES, required: true },
    { key: "g", field: "target", kind: "text" },
  ],
  A: [
    { key: "g", field: "target", kind: "text" },
    { key: "e", field: "expectation", kind: "text", required: true },
    { key: "v", field: "sensitivity", kind: "enum", table: LEVEL_CODES, required: true },
    { key: "b", field: "bias", kind: "text", required: true },
    { key: "w", field: "time", kind: "text", required: true },
  ],
  T: [
    { key: "g", field: "target", kind: "text" },
    { key: "y", field: "signalType", kind: "text", required: true },
    { key: "c", field: "confidence", kind: "enum", table: TRACE_CONFIDENCE_CODES, required: true },
    { key: "a", field: "action", kind: "text", required: true },
    { key: "o", field: "observations", kind: "list" },
  ],
  X: [
    { key: "n", field: "name", kind: "text", required: true },
    { key: "0", field: "h0", kind: "text", required: true },
    { key: "1", field: "h1", kind: "text", required: true },
    { key: "z", field: "signature", kind: "text" },
    { key: "k", field: "controls", kind: "list", required: true },
    { key: "p", field: "preregister", kind: "bool", required: true },
    { key: "r", field: "stopRule", kind: "text", required: true },
    { key: "u", field: "output", kind: "text", required: true },
  ],
  P: [
    { key: "w", field: "awareness", kind: "bool" },
    { key: "c", field: "curiosity", kind: "enum", table: LEVEL_CODES },
    { key: "m", field: "dominance", kind: "enum", table: DOMINANCE_CODES },
    { key: "f", field: "fear", kind: "enum", table: FEAR_CODES },
    { key: "l", field: "alignment", kind: "enum", table: ALIGNMENT_CODES },
    { key: "y", field: "signal", kind: "text" },
    { key: "d", field: "detected", kind: "bool" },
    { key: "q", field: "confidence", kind: "unit", note: "0..1, three decimals" },
    { key: "n", field: "round", kind: "int" },
  ],
  L: [
    { key: "d", field: "detect", kind: "list", required: true },
    { key: "j", field: "reject", kind: "list", required: true },
  ],
  E: [
    { key: "y", field: "signal", kind: "text", required: true },
    { key: "g", field: "target", kind: "targets", note: "one target or several separated by ;" },
    { key: "p", field: "priority", kind: "enum", table: PRIORITY_CODES },
    { key: "n", field: "round", kind: "int" },
    { key: "c", field: "content", kind: "text" },
  ],
  S: [
    { key: "f", field: "source", kind: "text", required: true },
    { key: "g", field: "destination", kind: "text", required: true },
    { key: "h", field: "coherence", kind: "pct", required: true, note: "0..100 integer" },
    { key: "c", field: "content", kind: "text", required: true },
  ],
  O: [
    { key: "g", field: "target", kind: "text", required: true },
    { key: "w", field: "duration", kind: "text", required: true },
    { key: "o", field: "findings", kind: "list", required: true },
  ],
  F: [
    { key: "j", field: "subject", kind: "text", required: true },
    { key: "o", field: "insights", kind: "list", required: true },
    { key: "h", field: "confidence", kind: "pct", required: true, note: "0..100 integer" },
  ],
};

const BLOCK_BY_TYPE: Record<string, keyof typeof BLOCK_CODES> = Object.fromEntries(Object.entries(BLOCK_CODES).map(([k, v]) => [v, k])) as any;

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

const RESERVED = new Set(["+", "%", ";", "=", "|", "#", "~", ">", ":", " "]);

export function escapeValue(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === " ") { out += "+"; continue; }
    const code = ch.codePointAt(0)!;
    if (RESERVED.has(ch) || code < 0x20 || code > 0x7e) {
      for (const byte of Buffer.from(ch, "utf8")) out += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    } else out += ch;
  }
  return out;
}

export function unescapeValue(token: string): string {
  const bytes: number[] = [];
  let out = "";
  const flush = () => { if (bytes.length) { out += Buffer.from(bytes).toString("utf8"); bytes.length = 0; } };
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "%" && /^[0-9A-Fa-f]{2}$/.test(token.slice(i + 1, i + 3))) { bytes.push(parseInt(token.slice(i + 1, i + 3), 16)); i += 2; continue; }
    flush();
    out += ch === "+" ? " " : ch;
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no xorout)
// ---------------------------------------------------------------------------

export function crc16(text: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(text, "utf8")) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

const IDENT = /^[A-Z0-9][A-Z0-9-]{0,15}$/;

/** Uppercase, keep A-Z 0-9 '-', collapse other runs to '-', cap at 16. '*' is broadcast. */
export function normalizeIdentifier(id: string): string {
  if (id === "*" || id === "") return "*";
  const up = id.toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 16);
  if (!IDENT.test(up)) throw new Error(`Invalid station/agent identifier: ${id}`);
  return up;
}

// ---------------------------------------------------------------------------
// Block ⇄ tokens
// ---------------------------------------------------------------------------

function codeFor(table: Record<string, string>, value: string, what: string): string {
  const hit = Object.entries(table).find(([, v]) => v === value);
  if (!hit) throw new Error(`Unknown ${what} value: ${value}`);
  return hit[0];
}

function valueFor(table: Record<string, string>, code: string, what: string): string {
  const v = table[code] ?? table[code.toUpperCase()] ?? table[code.toLowerCase()];
  if (!v) throw new Error(`Unknown ${what} code: ${code}`);
  return v;
}

export function encodeBlock(block: SingularisBlock): string {
  const code = BLOCK_BY_TYPE[block.type];
  if (!code) throw new Error(`Unknown block type: ${(block as any).type}`);
  const tokens: string[] = [code];
  for (const f of BLOCK_FIELDS[code]) {
    const raw = (block as any)[f.field];
    if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0 && !f.required)) {
      if (f.required) throw new Error(`${block.type} is missing required field ${f.field}`);
      continue;
    }
    let v: string;
    switch (f.kind) {
      case "text": v = escapeValue(String(raw)); break;
      case "list": v = (raw as string[]).map((s) => escapeValue(String(s))).join(";"); break;
      case "targets": v = (Array.isArray(raw) ? raw : [raw]).map((s) => escapeValue(String(s))).join(";"); break;
      case "enum": v = codeFor(f.table!, String(raw), f.field); break;
      case "enumlist": v = (raw as string[]).map((s) => codeFor(f.table!, s, f.field)).join(""); break;
      case "bool": v = raw ? "1" : "0"; break;
      case "int": v = String(Math.trunc(Number(raw))); break;
      case "unit": v = Math.max(0, Math.min(1, Number(raw))).toFixed(3).replace(/^0/, "").replace(/0+$/, "").replace(/\.$/, ".0"); if (v === ".0") v = "0"; if (v === "1.0") v = "1"; break;
      case "pct": v = String(Math.max(0, Math.min(100, Math.round(Number(raw))))); break;
    }
    if (v === "" && !f.required) continue;
    tokens.push(`${f.key}=${v}`);
  }
  return tokens.join(" ");
}

export function decodeBlock(tokens: string[]): SingularisBlock {
  if (!tokens.length) throw new Error("Empty block");
  const code = tokens[0].toUpperCase() as keyof typeof BLOCK_CODES;
  const type = BLOCK_CODES[code];
  if (!type) throw new Error(`Unknown block code: ${tokens[0]}`);
  const fields = BLOCK_FIELDS[code];
  const block: Record<string, unknown> = { type };
  const seen = new Set<string>();
  for (const tok of tokens.slice(1)) {
    const eq = tok.indexOf("=");
    if (eq < 1) throw new Error(`Malformed token in ${type}: ${tok}`);
    const key = tok.slice(0, eq);
    const val = tok.slice(eq + 1);
    const f = fields.find((x) => x.key === key || x.key === key.toLowerCase());
    if (!f) throw new Error(`Unknown key '${key}' for ${type}`);
    if (seen.has(f.key)) throw new Error(`Duplicate key '${key}' in ${type}`);
    seen.add(f.key);
    switch (f.kind) {
      case "text": block[f.field] = unescapeValue(val); break;
      case "list": block[f.field] = val === "" ? [] : val.split(";").map(unescapeValue); break;
      case "targets": { const parts = val.split(";").map(unescapeValue); block[f.field] = parts.length === 1 ? parts[0] : parts; break; }
      case "enum": block[f.field] = valueFor(f.table!, val, f.field); break;
      case "enumlist": block[f.field] = [...val].map((c) => valueFor(f.table!, c, f.field)); break;
      case "bool": if (val !== "0" && val !== "1") throw new Error(`Boolean ${f.field} must be 0 or 1`); block[f.field] = val === "1"; break;
      case "int": if (!/^-?\d+$/.test(val)) throw new Error(`Integer ${f.field} malformed: ${val}`); block[f.field] = Number(val); break;
      case "unit": { const n = Number(val); if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error(`Unit ${f.field} out of range: ${val}`); block[f.field] = n; break; }
      case "pct": { const n = Number(val); if (!Number.isInteger(n) || n < 0 || n > 100) throw new Error(`Percent ${f.field} out of range: ${val}`); block[f.field] = n; break; }
    }
  }
  for (const f of fields) if (f.required && !(f.field in block)) throw new Error(`${type} is missing required field ${f.field} (key ${f.key})`);
  return block as unknown as SingularisBlock;
}

// ---------------------------------------------------------------------------
// Message ⇄ frames
// ---------------------------------------------------------------------------

export interface EncodeOptions {
  from: string;
  to?: string | null; // undefined/null/'*' = broadcast
  messageId?: string; // two base-36 chars; random when omitted
  experimentId?: string | null;
  sessionId?: string | null;
  frameLength?: number;
  /**
   * Upper-case the whole body BEFORE computing the CRC, for transports that fold case
   * (some digital modes carry uppercase only). Codes and keys are case-insensitive so
   * nothing structural is lost; free-text values arrive uppercase (documented as lossy).
   */
  caseFold?: boolean;
}

export interface DecodedFrame {
  from: string;
  to: string; // '*' for broadcast
  protocol: string;
  messageId: string;
  seq: number;
  total: number;
  payload: string;
  continues: boolean; // payload ended with '~'
  crc: string;
  crcOk: boolean;
  raw: string;
}

export interface DecodedMessage {
  from: string;
  to: string;
  messageId: string;
  experimentId?: string;
  sessionId?: string;
  blocks: SingularisBlock[];
  frames: number;
}

const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function randomMessageId(): string {
  return BASE36[Math.floor(Math.random() * 36)] + BASE36[Math.floor(Math.random() * 36)];
}

/** Payload string for a whole message (blocks joined by ' | '), before framing. */
export function encodePayload(blocks: SingularisBlock[], meta: { experimentId?: string | null; sessionId?: string | null } = {}): string {
  if (!blocks.length) throw new Error("A message needs at least one block");
  const head: string[] = [];
  if (meta.experimentId) head.push(`@x=${escapeValue(meta.experimentId)}`);
  if (meta.sessionId) head.push(`@s=${escapeValue(meta.sessionId)}`);
  const body = blocks.map(encodeBlock).join(" | ");
  return [...head, body].join(" ");
}

function frameHeader(from: string, to: string, id: string, seq: number, total: number): string {
  return `${from}>${to}:${PROTOCOL} ${id}:${seq}/${total} `;
}

/** Split a payload into frames that fit `frameLength` including header and CRC. */
export function encodeMessage(blocks: SingularisBlock[], opts: EncodeOptions): string[] {
  const from = normalizeIdentifier(opts.from);
  const to = normalizeIdentifier(opts.to ?? "*");
  const id = (opts.messageId ?? randomMessageId()).toUpperCase();
  if (!/^[0-9A-Z]{2}$/.test(id)) throw new Error("messageId must be two base-36 characters");
  const frameLength = Math.max(MIN_FRAME_LENGTH, opts.frameLength ?? DEFAULT_FRAME_LENGTH);
  const payload = encodePayload(blocks, opts);
  const tokens = payload.split(" ");

  // Two passes: the total frame count appears in every header, so lay out with
  // a generous header width first, then re-lay if the digit count changes.
  const layout = (totalGuess: number): string[] => {
    const headerLen = frameHeader(from, to, id, totalGuess, totalGuess).length;
    const capacity = frameLength - headerLen - 6; // ' #CCCC'
    if (capacity < 8) throw new Error(`frameLength ${frameLength} leaves no room for payload with these identifiers`);
    const frames: string[] = [];
    let cur = "";
    const push = () => { if (cur) { frames.push(cur); cur = ""; } };
    for (const tok of tokens) {
      if (tok.length <= capacity) {
        const candidate = cur ? `${cur} ${tok}` : tok;
        if (candidate.length <= capacity) { cur = candidate; continue; }
        push();
        cur = tok;
        continue;
      }
      // Oversized token: hard-split with '~' continuation markers.
      push();
      let rest = tok;
      while (rest.length > capacity) {
        // never split inside a %XX escape
        let cut = capacity - 1;
        const tail = rest.slice(0, cut);
        const pct = tail.lastIndexOf("%");
        if (pct >= 0 && pct > cut - 3) cut = pct;
        frames.push(`${rest.slice(0, cut)}~`);
        rest = rest.slice(cut);
      }
      cur = rest;
    }
    push();
    return frames;
  };

  let payloads = layout(9);
  if (payloads.length > 9) payloads = layout(payloads.length);
  const total = payloads.length;
  return payloads.map((p, i) => {
    let body = `${frameHeader(from, to, id, i + 1, total)}${p}`;
    if (opts.caseFold) body = body.toUpperCase();
    return `${body} #${crc16(body)}`;
  });
}

const FRAME_RE = /^([A-Za-z0-9-]{1,16}|\*)>([A-Za-z0-9-]{1,16}|\*):(SP\d+) ([0-9A-Za-z]{2}):(\d+)\/(\d+) (.*) #([0-9A-Fa-f]{4})$/;

export function parseFrame(line: string): DecodedFrame {
  const raw = line.trim();
  const m = FRAME_RE.exec(raw);
  if (!m) throw new Error("Not a Singularis Compact frame");
  const [, from, to, protocol, id, seq, total, payload, crc] = m;
  if (protocol.toUpperCase() !== PROTOCOL) throw new Error(`Unsupported protocol ${protocol}`);
  const body = raw.slice(0, raw.lastIndexOf(" #"));
  return {
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    protocol: PROTOCOL,
    messageId: id.toUpperCase(),
    seq: Number(seq),
    total: Number(total),
    payload: payload.endsWith("~") ? payload.slice(0, -1) : payload,
    continues: payload.endsWith("~"),
    crc: crc.toUpperCase(),
    crcOk: crc16(body) === crc.toUpperCase(),
    raw,
  };
}

/** Reassemble a complete set of frames (any order) into a message. Throws on CRC failure or gaps. */
export function decodeFrames(lines: string[]): DecodedMessage {
  const frames = lines.map(parseFrame);
  if (!frames.length) throw new Error("No frames");
  const bad = frames.filter((f) => !f.crcOk);
  if (bad.length) throw new Error(`CRC failure in frame ${bad.map((f) => f.seq).join(",")}`);
  const { from, to, messageId, total } = frames[0];
  for (const f of frames) {
    if (f.from !== from || f.to !== to || f.messageId !== messageId || f.total !== total) throw new Error("Frames belong to different messages");
  }
  const bySeq = new Map(frames.map((f) => [f.seq, f]));
  let payload = "";
  for (let s = 1; s <= total; s++) {
    const f = bySeq.get(s);
    if (!f) throw new Error(`Missing frame ${s}/${total}`);
    const prev = bySeq.get(s - 1);
    payload += s === 1 || prev?.continues ? f.payload : ` ${f.payload}`;
  }
  return { ...decodePayload(payload), from, to, messageId, frames: total };
}

export function decodePayload(payload: string): Omit<DecodedMessage, "from" | "to" | "messageId" | "frames"> {
  const tokens = payload.split(" ").filter(Boolean);
  const meta: { experimentId?: string; sessionId?: string } = {};
  while (tokens.length && tokens[0].startsWith("@")) {
    const t = tokens.shift()!;
    const key = t.slice(0, 3).toLowerCase(); // meta keys are case-insensitive like every other code
    if (key === "@x=") meta.experimentId = unescapeValue(t.slice(3));
    else if (key === "@s=") meta.sessionId = unescapeValue(t.slice(3));
    else throw new Error(`Unknown meta token ${t}`);
  }
  const groups: string[][] = [[]];
  for (const t of tokens) { if (t === "|") groups.push([]); else groups[groups.length - 1].push(t); }
  const blocks = groups.filter((g) => g.length).map(decodeBlock);
  if (!blocks.length) throw new Error("Payload carries no blocks");
  return { ...meta, blocks };
}

/**
 * Incremental reassembly for a receiver: feed frames as they arrive (any order,
 * duplicates tolerated); complete messages are returned as they become whole.
 */
export class FrameAssembler {
  private pending = new Map<string, { frames: Map<number, DecodedFrame>; firstSeen: number }>();

  constructor(private readonly ttlMs = 15 * 60_000) {}

  /** Returns the completed message when this frame completes one, else null. Ignores frames that fail CRC. */
  feed(line: string, now = Date.now()): { message: DecodedMessage; frames: DecodedFrame[] } | null {
    let frame: DecodedFrame;
    try { frame = parseFrame(line); } catch { return null; }
    if (!frame.crcOk) return null;
    this.expire(now);
    const key = `${frame.from}>${frame.to}:${frame.messageId}:${frame.total}`;
    const entry = this.pending.get(key) ?? { frames: new Map(), firstSeen: now };
    entry.frames.set(frame.seq, frame);
    this.pending.set(key, entry);
    if (entry.frames.size < frame.total) return null;
    this.pending.delete(key);
    const frames = [...entry.frames.values()].sort((a, b) => a.seq - b.seq);
    try {
      return { message: decodeFrames(frames.map((f) => f.raw)), frames };
    } catch {
      return null;
    }
  }

  get pendingCount(): number { return this.pending.size; }

  private expire(now: number): void {
    for (const [k, v] of this.pending) if (now - v.firstSeen > this.ttlMs) this.pending.delete(k);
  }
}

/** Convenience: a stored SingularisMessage → frames, using agent ids as identifiers unless a callsign map is given. */
export function framesForMessage(msg: Pick<SingularisMessage, "fromAgentId" | "toAgentId" | "experimentId" | "sessionId" | "blocks">, callsigns: Record<string, string> = {}, frameLength?: number): string[] {
  const name = (id?: string | null) => (id ? callsigns[id] ?? id : "*");
  return encodeMessage(msg.blocks, { from: name(msg.fromAgentId), to: name(msg.toAgentId), experimentId: msg.experimentId ?? null, sessionId: msg.sessionId ?? null, frameLength });
}
