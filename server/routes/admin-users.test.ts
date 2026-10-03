import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

const storageMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserByUsername: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock("../storage", () => ({ storage: storageMock }));

import { createUserAsAdmin, deleteUserAsAdmin, resetUserSecret } from "./admin-users";

const PROOF = "a".repeat(64);

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
const admin = { id: "admin-1", role: "admin", userType: "human" };

describe("admin user management", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a human user and ignores role and userType in the body", async () => {
    storageMock.getUserByUsername.mockResolvedValue(undefined);
    storageMock.createUser.mockImplementation(async (u: any) => ({ id: "u1", createdAt: new Date(), ...u }));
    const res = response();
    await createUserAsAdmin({ user: admin, body: {
      username: "alice", displayName: "Alice", zkProof: PROOF, role: "admin", userType: "agent",
    } } as any, res as any, vi.fn());
    const created = storageMock.createUser.mock.calls[0][0];
    expect(created.role).toBe("user");
    expect(created.userType).toBe("human");
    expect(created.zkpCommitment).not.toBe(PROOF);
    expect(await bcrypt.compare(PROOF, created.zkpCommitment)).toBe(true);
    const sent = res.json.mock.calls[0][0];
    expect(sent.zkpCommitment).toBeUndefined();
  });

  it("rejects a proof that is not 64 hex characters", async () => {
    const res = response();
    await createUserAsAdmin({ user: admin, body: { username: "bob", displayName: "Bob", zkProof: "short" } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(storageMock.createUser).not.toHaveBeenCalled();
  });

  it("rejects a duplicate username with 409", async () => {
    storageMock.getUserByUsername.mockResolvedValue({ id: "x" });
    const res = response();
    await createUserAsAdmin({ user: admin, body: { username: "alice", displayName: "Alice", zkProof: PROOF } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("resets a user's secret to a bcrypt of the new proof", async () => {
    storageMock.getUser.mockResolvedValue({ id: "u1", username: "0xSCADA-QE" });
    storageMock.updateUser.mockImplementation(async (_id: string, u: any) => ({ id: "u1", ...u }));
    const res = response();
    await resetUserSecret({ user: admin, params: { id: "u1" }, body: { zkProof: PROOF } } as any, res as any, vi.fn());
    const [, updates] = storageMock.updateUser.mock.calls[0];
    expect(await bcrypt.compare(PROOF, updates.zkpCommitment)).toBe(true);
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("returns 404 when resetting an unknown user", async () => {
    storageMock.getUser.mockResolvedValue(undefined);
    const res = response();
    await resetUserSecret({ user: admin, params: { id: "nope" }, body: { zkProof: PROOF } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("deletes an unreferenced user", async () => {
    storageMock.getUser.mockResolvedValue({ id: "probe" });
    storageMock.deleteUser.mockResolvedValue(undefined);
    const res = response();
    await deleteUserAsAdmin({ user: admin, params: { id: "probe" } } as any, res as any, vi.fn());
    expect(storageMock.deleteUser).toHaveBeenCalledWith("probe");
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });

  it("refuses to delete a referenced user with 409", async () => {
    storageMock.getUser.mockResolvedValue({ id: "author" });
    storageMock.deleteUser.mockRejectedValue(Object.assign(new Error("referenced"), { code: "user_referenced" }));
    const res = response();
    await deleteUserAsAdmin({ user: admin, params: { id: "author" } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("refuses to delete yourself", async () => {
    const res = response();
    await deleteUserAsAdmin({ user: admin, params: { id: "admin-1" } } as any, res as any, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(storageMock.deleteUser).not.toHaveBeenCalled();
  });
});
