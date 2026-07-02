import {
  FAMILY_ROLES,
  resolveEntitlements,
  sumCents,
  type FamilyOverview,
} from "@budgetsmart/shared";
import { Router } from "express";
import { z } from "zod";
import { family, goals, users } from "../../db/repo.js";
import { effectiveTier } from "../../lib/entitlement.js";
import { ApiError, asyncHandler, routeParam } from "../../lib/http.js";
import { serializeChore, serializeFamilyMember, serializeFamilyRequest, serializeGoal } from "../../lib/serialize.js";
import { requireAuth, userIdOf } from "../../middleware/auth.js";
import { requireFeature } from "../../middleware/entitlements.js";

export const familyRouter = Router();
familyRouter.use(requireAuth);

/** Resolve the caller and require a family-capable plan (verified entitlement). */
function requireFamilyPlan(userId: string) {
  const user = users.findById(userId);
  if (!user) throw ApiError.unauthorized();
  const ent = resolveEntitlements(effectiveTier(userId));
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

/* ------------------------------------------------------------------ *
 * Chores & allowance automation (Family T2+)
 * ------------------------------------------------------------------ */
const choreSchema = z.object({
  memberId: z.string().min(1),
  name: z.string().min(1).max(80),
  reward: z.number().int().positive("Reward must be greater than zero"),
  repeats: z.boolean().default(false),
});

familyRouter.get(
  "/chores",
  requireFeature("chores"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFamilyPlan(userId);
    res.json({ chores: family.listChores(userId).map(serializeChore) });
  }),
);

familyRouter.post(
  "/chores",
  requireFeature("chores"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFamilyPlan(userId);
    const data = choreSchema.parse(req.body);
    if (!family.findMember(userId, data.memberId)) throw ApiError.notFound("Member not found");
    family.addChore({ ...data, ownerId: userId });
    res.status(201).json({ chores: family.listChores(userId).map(serializeChore) });
  }),
);

/** Completing a chore pays the reward straight into the member's wallet. */
familyRouter.post(
  "/chores/:id/complete",
  requireFeature("chores"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ent } = requireFamilyPlan(userId);
    const chore = family.findChore(userId, routeParam(req, "id"));
    if (!chore) throw ApiError.notFound("Chore not found");
    if (!chore.repeats && chore.timesDone > 0) throw ApiError.badRequest("That chore is already done");
    family.completeChore(chore.id);
    family.addLedgerEntry({
      ownerId: userId,
      memberId: chore.memberId,
      kind: "allowance",
      amount: chore.reward,
      note: `Chore: ${chore.name}`,
      date: new Date().toISOString().slice(0, 10),
    });
    res.json({
      chores: family.listChores(userId).map(serializeChore),
      overview: overview(userId, ent.memberLimit),
    });
  }),
);

familyRouter.delete(
  "/chores/:id",
  requireFeature("chores"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFamilyPlan(userId);
    const chore = family.findChore(userId, routeParam(req, "id"));
    if (!chore) throw ApiError.notFound("Chore not found");
    family.removeChore(chore.id);
    res.json({ chores: family.listChores(userId).map(serializeChore) });
  }),
);

/* ------------------------------------------------------------------ *
 * Purchase approvals (Family T2+)
 * ------------------------------------------------------------------ */
const requestSchema = z.object({
  memberId: z.string().min(1),
  title: z.string().min(1).max(120),
  amount: z.number().int().positive(),
  note: z.string().max(200).nullable().default(null),
});

familyRouter.get(
  "/requests",
  requireFeature("approvals"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFamilyPlan(userId);
    res.json({ requests: family.listRequests(userId).map(serializeFamilyRequest) });
  }),
);

familyRouter.post(
  "/requests",
  requireFeature("approvals"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFamilyPlan(userId);
    const data = requestSchema.parse(req.body);
    if (!family.findMember(userId, data.memberId)) throw ApiError.notFound("Member not found");
    family.addRequest({ ...data, ownerId: userId });
    res.status(201).json({ requests: family.listRequests(userId).map(serializeFamilyRequest) });
  }),
);

/** Approving spends the amount from the member's wallet; declining just closes it. */
familyRouter.post(
  "/requests/:id/resolve",
  requireFeature("approvals"),
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ent } = requireFamilyPlan(userId);
    const decision = z.object({ approve: z.boolean() }).parse(req.body);
    const request = family.findRequest(userId, routeParam(req, "id"));
    if (!request) throw ApiError.notFound("Request not found");
    if (request.status !== "pending") throw ApiError.badRequest("That request was already resolved");

    if (decision.approve) {
      const member = family.findMember(userId, request.memberId);
      if (!member) throw ApiError.notFound("Member not found");
      const balance = serializeFamilyMember(member, family.ledger(userId, member.id)).balance;
      if (request.amount > balance) {
        throw ApiError.badRequest("That exceeds the member's wallet balance — add allowance first");
      }
      family.addLedgerEntry({
        ownerId: userId,
        memberId: request.memberId,
        kind: "spend",
        amount: request.amount,
        note: `Approved: ${request.title}`,
        date: new Date().toISOString().slice(0, 10),
      });
    }
    family.resolveRequest(request.id, decision.approve ? "approved" : "declined");
    res.json({
      requests: family.listRequests(userId).map(serializeFamilyRequest),
      overview: overview(userId, ent.memberLimit),
    });
  }),
);

/* ------------------------------------------------------------------ *
 * Shared goals — family members contribute from their wallets
 * ------------------------------------------------------------------ */
familyRouter.get(
  "/goals",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    requireFamilyPlan(userId);
    res.json({ goals: goals.listByUser(userId).filter((g) => g.shared === 1).map(serializeGoal) });
  }),
);

const contributeSchema = z.object({
  memberId: z.string().min(1),
  amount: z.number().int().positive("Amount must be greater than zero"),
});

/** A member chips in from their wallet; the goal advances by the same amount. */
familyRouter.post(
  "/goals/:id/contribute",
  asyncHandler(async (req, res) => {
    const userId = userIdOf(req);
    const { ent } = requireFamilyPlan(userId);
    const goal = goals.findForUser(userId, routeParam(req, "id"));
    if (!goal || goal.shared !== 1) throw ApiError.notFound("Shared goal not found");
    const { memberId, amount } = contributeSchema.parse(req.body);
    const member = family.findMember(userId, memberId);
    if (!member) throw ApiError.notFound("Member not found");
    const balance = serializeFamilyMember(member, family.ledger(userId, member.id)).balance;
    if (amount > balance) throw ApiError.badRequest("That exceeds the member's wallet balance");

    family.addLedgerEntry({
      ownerId: userId,
      memberId: member.id,
      kind: "invest",
      amount,
      note: `Goal: ${goal.name}`,
      date: new Date().toISOString().slice(0, 10),
    });
    const updated = goals.contribute(goal.id, amount);
    res.json({
      goal: serializeGoal(updated),
      overview: overview(userId, ent.memberLimit),
    });
  }),
);
