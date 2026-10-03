import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const storageMock = vi.hoisted(() => ({
  getUserByUsername: vi.fn(),
  getAllUsers: vi.fn(),
  createUser: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: storageMock }));

import { registerHandler } from "./register";

const PROOF = "b".repeat(64);
function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe("registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.getUserByUsername.mockResolvedValue(undefined);
    storageMock.createUser.mockImplementation(async (u: any) => ({ id: "new", createdAt: new Date(), ...u }));
  });

  it("always creates a human, even when the body says agent", async () => {
    storageMock.getAllUsers.mockResolvedValue([{ role: "admin" }]);
    const req = { body: { username: "mallory", displayName: "M", userType: "agent", zkProof: PROOF }, session: {} };
    const res = response();
    await registerHandler(req as any, res as any, vi.fn());
    expect(storageMock.createUser.mock.calls[0][0].userType).toBe("human");
    expect(storageMock.createUser.mock.calls[0][0].role).toBe("user");
    expect((req.session as any).userId).toBe("new");
  });

  it("still bootstraps the first registrant as admin when no admin exists", async () => {
    storageMock.getAllUsers.mockResolvedValue([]);
    const res = response();
    await registerHandler({ body: { username: "first", displayName: "F", zkProof: PROOF }, session: {} } as any, res as any, vi.fn());
    expect(storageMock.createUser.mock.calls[0][0].role).toBe("admin");
  });

  it("stores a bcrypt of the proof, never the proof", async () => {
    storageMock.getAllUsers.mockResolvedValue([{ role: "admin" }]);
    const res = response();
    await registerHandler({ body: { username: "c", displayName: "C", zkProof: PROOF }, session: {} } as any, res as any, vi.fn());
    const stored = storageMock.createUser.mock.calls[0][0].zkpCommitment;
    expect(stored).not.toBe(PROOF);
    expect(await bcrypt.compare(PROOF, stored)).toBe(true);
  });

  it("rejects a taken username", async () => {
    storageMock.getUserByUsername.mockResolvedValue({ id: "x" });
    const res = response();
    await registerHandler({ body: { username: "c", displayName: "C", zkProof: PROOF }, session: {} } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(storageMock.createUser).not.toHaveBeenCalled();
  });

  it("rejects missing fields", async () => {
    const res = response();
    await registerHandler({ body: { username: "c" }, session: {} } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
