import type { RequestHandler } from "express";
import bcrypt from "bcryptjs";
import { storage } from "../storage";
import { sanitizeUser } from "../lib/sanitize";

/**
 * Self-registration. Always creates a human: agent accounts are created by an admin
 * promoting an existing account (ledger spec 3.2), never self-declared.
 */
export const registerHandler: RequestHandler = async (req, res) => {
  try {
    const { username, displayName, zkProof, bio, researchInterests } = req.body ?? {};
    if (!username || !displayName || !zkProof) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }
    if (await storage.getUserByUsername(username)) {
      res.status(400).json({ error: "Username already taken" });
      return;
    }
    const interestsArray = researchInterests
      ? String(researchInterests).split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
    const zkpCommitment = await bcrypt.hash(zkProof, 12);
    // Bootstrap: the first registrant while no admin exists becomes admin.
    const existingUsers = await storage.getAllUsers();
    const role = existingUsers.some((u) => u.role === "admin") ? "user" : "admin";
    const user = await storage.createUser({
      username,
      zkpCommitment,
      userType: "human",
      role,
      displayName,
      bio: bio || null,
      researchInterests: interestsArray,
    });
    (req.session as any).userId = user.id;
    res.json({ user: sanitizeUser(user) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
