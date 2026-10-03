// Reference signer for the ledger NATS door. Usage:
//   npx tsx scripts/ledger-sign.ts keygen --out <private.pem> [--force]
//   npx tsx scripts/ledger-sign.ts sign <key_id> <record.json> [<private.pem>]
// The private key is read from the file given as the last argument, else from the file named by
// LEDGER_SIGNING_KEY_FILE, else from the PEM text in LEDGER_SIGNING_KEY. It is never taken from argv as key
// material and never printed. Publish the printed JSON to SPACECHILD.ledger.file (use a NATS request to get the
// {ok, id} reply). The door requires record.clientRef and rejects record.held=true.
import { createPrivateKey, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { canonicalJson } from "../shared/ledger-hash";

export function rawPublicKeyBase64(publicKey: KeyObject): string {
  return publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
}

/** ISO 8601 UTC with milliseconds, which is the only timestamp shape the door accepts. */
export function signLedgerMessage(
  record: Record<string, unknown>, keyId: string, privateKey: KeyObject,
  now: Date = new Date(), nonce: string = randomBytes(18).toString("base64url"),
) {
  if (typeof record.clientRef !== "string" || record.clientRef.trim() === "") {
    throw new Error("record.clientRef is required on the NATS door (it makes retries safe)");
  }
  if (nonce.length < 16 || nonce.length > 128) throw new Error("nonce must be 16-128 characters");
  if (record.held === true) throw new Error("held records cannot be filed over NATS; use HTTPS or MCP");
  const body = { record, key_id: keyId, ts: now.toISOString(), nonce };
  return { ...body, sig: sign(null, Buffer.from(canonicalJson(body), "utf8"), privateKey).toString("base64") };
}

export function loadPrivateKey(pemPath?: string, env: NodeJS.ProcessEnv = process.env): KeyObject {
  const path = pemPath ?? env.LEDGER_SIGNING_KEY_FILE;
  // A single-line env value may carry escaped newlines (a backslash followed by n); turn them into real ones.
  const pem = path ? readFileSync(path, "utf8") : env.LEDGER_SIGNING_KEY?.replace(/\\n/g, "\n");
  if (!pem) throw new Error("no private key: pass a PEM path, or set LEDGER_SIGNING_KEY_FILE or LEDGER_SIGNING_KEY");
  return createPrivateKey(pem);
}

const USAGE = "usage: ledger-sign.ts keygen --out <private.pem> [--force] | sign <key_id> <record.json> [<private.pem>]";

/** The CLI. Never writes key material to stdout or stderr; returns the process exit code. */
export function main(argv: string[], out: (line: string) => void = console.log, err: (line: string) => void = console.error): number {
  const [cmd, ...rest] = argv;
  try {
    if (cmd === "keygen") {
      let outPath: string | undefined;
      let force = false;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === "--force") force = true;
        else if (rest[i] === "--out" && rest[i + 1] !== undefined && !rest[i + 1].startsWith("--")) outPath = rest[++i];
        else { err(`ledger-sign: unrecognised or incomplete argument "${rest[i].slice(0, 40)}"\n${USAGE}`); return 2; }
      }
      if (!outPath) { err(`ledger-sign: keygen requires --out <file>\n${USAGE}`); return 2; }
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
      // "wx" refuses to overwrite an existing key; --force opts in. Mode 0600 is enforced on POSIX only.
      writeFileSync(outPath, pem, { mode: 0o600, flag: force ? "w" : "wx" });
      err(`private key written to ${outPath} (keep it secret; it never leaves this machine)`);
      out(`ed25519PublicKey (send ONLY this to the site admin): ${rawPublicKeyBase64(publicKey)}`);
      return 0;
    }
    if (cmd === "sign" && (rest.length === 2 || rest.length === 3)) {
      const [keyId, recordPath, pemPath] = rest;
      const record = JSON.parse(readFileSync(recordPath, "utf8"));
      out(JSON.stringify(signLedgerMessage(record, keyId, loadPrivateKey(pemPath))));
      return 0;
    }
    err(USAGE);
    return 2;
  } catch (error) {
    err(`ledger-sign: ${(error as Error).message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exit(main(process.argv.slice(2)));
}
