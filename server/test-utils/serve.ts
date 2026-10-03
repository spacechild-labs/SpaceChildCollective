import type { Express } from "express";
import type { AddressInfo } from "node:net";

/** Start an Express app on an ephemeral port for fetch-based route tests. */
export async function serve(app: Express): Promise<{ base: string; close(): Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
