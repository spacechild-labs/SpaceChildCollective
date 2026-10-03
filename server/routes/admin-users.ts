import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { storage } from "../storage";
import { sanitizeUser } from "../lib/sanitize";

/** A client-side SHA-256 of the secret, hex encoded (what /auth sends as zkProof). */
const proofSchema = z.string().regex(/^[0-9a-f]{64}$/, "zkProof must be 64 lowercase hex characters");

/** Admin-created users are always humans with role "user"; role and userType are never read from the body. */
export const adminCreateUserSchema = z.object({
  username: z.string().trim().min(3).max(64),
  displayName: z.string().trim().min(2).max(120),
  zkProof: proofSchema,
  bio: z.string().max(2000).optional(),
  researchInterests: z.array(z.string().max(80)).max(20).optional(),
});

export const createUserAsAdmin: RequestHandler = async (req, res) => {
  const parsed = adminCreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  try {
    const { username, displayName, zkProof, bio, researchInterests } = parsed.data;
    if (await storage.getUserByUsername(username)) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    const user = await storage.createUser({
      username,
      displayName,
      zkpCommitment: await bcrypt.hash(zkProof, 12),
      userType: "human",
      role: "user",
      bio: bio ?? null,
      researchInterests: researchInterests ?? [],
    });
    res.json(sanitizeUser(user));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const resetUserSecret: RequestHandler = async (req, res) => {
  const parsed = z.object({ zkProof: proofSchema }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await storage.updateUser(user.id, { zkpCommitment: await bcrypt.hash(parsed.data.zkProof, 12) });
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteUserAsAdmin: RequestHandler = async (req, res) => {
  if (req.params.id === req.user?.id) {
    res.status(400).json({ error: "Refusing to delete your own account" });
    return;
  }
  try {
    const user = await storage.getUser(req.params.id);
    if (!user) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    await storage.deleteUser(user.id);
    res.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "user_referenced") {
      res.status(409).json({ error: "user_referenced", message: "User has papers, tasks or records; not deleted" });
      return;
    }
    res.status(500).json({ error: error.message });
  }
};
