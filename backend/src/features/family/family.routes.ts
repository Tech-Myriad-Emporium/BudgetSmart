import {
  FAMILY_ROLES,
  resolveEntitlements,
  sumCents,
  type FamilyOverview,
} from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { family, users } from "../../db/repo.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeFamilyMember } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";

export const familyRouter = Router();
familyRouter.use(requireAuth);

/** Resolve the caller and require a family-capable plan. */
function requireFamilyPlan(userId: string) {
  const user = users.findById(userId);
  if (!user) throw ApiError.unauthorized();
  const ent = resolveEntitlements(user.tier);
  if (!ent.canManageFamily) {
    throw ApiError.forbidden("Family management requires a Family plan");
  }
  return { user, ent };
}

/** Build the family overview (members folded with their ledgers + totals). */
function overview(ownerId: string, memberLimit: number): FamilyOverview {
  const members = family.listMembers(ownerId).map((m) => serializeFamilyMember(m, family.ledger(ownerId, m.id)));
  return {
    members,
    memberCount: members.length,
    memberLimit,
    totalAllowance: sumCents(members.map((m) => m.allowanceTotal)),
    totalBalance: sumCents(members.map((m) => m.balance)),
    totalSpent: sumCents(members.map((m) => m.spentTotal)),
    totalInvested: sumCents(members.map((m) => m.investedTotal)),
  };
}

familyRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ent } = requireFamilyPlan(userId);
    res.json({ overview: overview(userId, ent.memberLimit) });
  }),
);

const memberSchema = z.object({
  name: z.string().min(1).max(60),
  role: z.enum(FAMILY_ROLES).default("child"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a hex value").default("#00FF41"),
});

familyRouter.post(
  "/members",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ent } = requireFamilyPlan(userId);
    if (family.memberCount(userId) >= ent.memberLimit) {
      throw ApiError.badRequest(`Your plan supports up to ${ent.memberLimit} members`);
    }
    const data = memberSchema.parse(req.body);
    family.addMember({ ...data, ownerId: userId });
    res.status(201).json({ overview: overview(userId, ent.memberLimit) });
  }),
);

familyRouter.delete(
  "/members/:id",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ent } = requireFamilyPlan(userId);
    const member = family.findMember(userId, routeParam(req, "id"));
    if (!member) throw ApiError.notFound("Member not found");
    family.removeMember(member.id);
    res.json({ overview: overview(userId, ent.memberLimit) });
  }),
);

const allowanceSchema = z.object({
  amount: z.number().int().positive("Amount must be greater than zero"),
  note: z.string().max(120).nullable().default(null),
});

/** POST allowance — the owner can ONLY add money to a member's wallet. */
familyRouter.post(
  "/members/:id/allowance",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ent } = requireFamilyPlan(userId);
    const member = family.findMember(userId, routeParam(req, "id"));
    if (!member) throw ApiError.notFound("Member not found");
    const { amount, note } = allowanceSchema.parse(req.body);
    family.addLedgerEntry({
      ownerId: userId,
      memberId: member.id,
      kind: "allowance",
      amount,
      note,
      date: new Date().toISOString().slice(0, 10),
    });
    res.json({ overview: overview(userId, ent.memberLimit) });
  }),
);

const recordSchema = z.object({
  kind: z.enum(["spend", "invest"]),
  amount: z.number().int().positive(),
  note: z.string().max(120).nullable().default(null),
});

/** POST a member's spend/invest from their wallet (cannot exceed balance). */
familyRouter.post(
  "/members/:id/record",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ent } = requireFamilyPlan(userId);
    const member = family.findMember(userId, routeParam(req, "id"));
    if (!member) throw ApiError.notFound("Member not found");

    const { kind, amount, note } = recordSchema.parse(req.body);
    const current = serializeFamilyMember(member, family.ledger(userId, member.id)).balance;
    if (amount > current) throw ApiError.badRequest("That exceeds the member's available balance");

    family.addLedgerEntry({
      ownerId: userId,
      memberId: member.id,
      kind,
      amount,
      note,
      date: new Date().toISOString().slice(0, 10),
    });
    res.json({ overview: overview(userId, ent.memberLimit) });
  }),
);
