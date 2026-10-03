// Reference signer for the ledger NATS door. Usage:
//   npx tsx scripts/ledger-sign.ts keygen [--out <private.pem>]
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
  if (record.held === true) throw new Error("held records cannot be filed over NATS; use HTTPS or MCP");
  const body = { record, key_id: keyId, ts: now.toISOString(), nonce };
  return { ...body, sig: sign(null, Buffer.from(canonicalJson(body), "utf8"), privateKey).toString("base64") };
}

function loadPrivateKey(pemPath?: string): KeyObject {
  const path = pemPath ?? process.env.LEDGER_SIGNING_KEY_FILE;
  const pem = path ? readFileSync(path, "utf8") : process.env.LEDGER_SIGNING_KEY?.replace(/\n/g, "\n");
  if (!pem) throw new Error("no private key: pass a PEM path, or set LEDGER_SIGNING_KEY_FILE or LEDGER_SIGNING_KEY");
  return createPrivateKey(pem);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    if (cmd === "keygen") {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
      const outAt = rest.indexOf("--out");
      if (outAt >= 0 && rest[outAt + 1]) {
        writeFileSync(rest[outAt + 1], pem, { mode: 0o600, flag: "wx" });
        console.error(`private key written to ${rest[outAt + 1]} (keep it secret)`);
      } else {
        console.log(pem);
      }
      console.log(`ed25519PublicKey (give this to the admin): ${rawPublicKeyBase64(publicKey)}`);
    } else if (cmd === "sign" && (rest.length === 2 || rest.length === 3)) {
      const [keyId, recordPath, pemPath] = rest;
      const record = JSON.parse(readFileSync(recordPath, "utf8"));
      console.log(JSON.stringify(signLedgerMessage(record, keyId, loadPrivateKey(pemPath))));
    } else {
      console.error("usage: ledger-sign.ts keygen [--out <private.pem>] | sign <key_id> <record.json> [<private.pem>]");
      process.exit(2);
    }
  } catch (error) {
    console.error(`ledger-sign: ${(error as Error).message}`);
    process.exit(1);
  }
}
