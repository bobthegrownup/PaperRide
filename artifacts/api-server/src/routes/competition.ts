import { Router, type IRouter } from "express";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { db, priceSnapshotsTable, roundsTable, settingsTable, submissionsTable, resultsTable, usersTable } from "@workspace/db";
import { PricingUnavailableError, quoteMarket, resolveMarket, searchMarkets } from "../lib/pricing";
import {
  GetAdminSettingsResponse,
  GetCurrentCompetitionResponse,
  GetMyHistoryQueryParams,
  GetMyHistoryResponse,
  SubmitPaperRideBody,
  SubmitPaperRideResponse,
  UpdateAdminSettingsBody,
  UpdateAdminSettingsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const now = () => new Date();
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function capturePrice(roundId: string, assetId: string) {
  const asset = await resolveMarket(assetId);
  const quote = await quoteMarket(assetId);
  const snapshot = {
    id: id("price"),
    roundId,
    assetId,
    tokenMint: asset.mint,
    price: String(quote.price),
    source: quote.source,
  };
  await db.insert(priceSnapshotsTable).values(snapshot);
  return { asset, price: quote.price, source: quote.source };
}

async function resolveRound(roundId: string) {
  const submissions = await db.select().from(submissionsTable).where(eq(submissionsTable.roundId, roundId));
  await Promise.allSettled(submissions.map(async (submission) => {
    const previous = await db.select().from(resultsTable).where(eq(resultsTable.submissionId, submission.id));
    if (previous[0]) return;
    let exit;
    try {
      exit = await capturePrice(roundId, submission.assetId);
    } catch (error) {
      console.warn("PaperRide exit price unavailable; retrying on the next resolution sweep.", {
        roundId,
        submissionId: submission.id,
        assetId: submission.assetId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const entry = Number(submission.entryPrice);
    const returnPct = submission.direction === "LONG"
      ? ((exit.price - entry) / entry) * 100
      : ((entry - exit.price) / entry) * 100;
    await db.insert(resultsTable).values({
      id: id("result"),
      submissionId: submission.id,
      roundId,
      exitPrice: String(exit.price),
      returnPct: String(returnPct),
    });
  }));
}

export async function resolveClosedRounds(): Promise<void> {
  const closedRounds = await db.select().from(roundsTable).where(lte(roundsTable.closesAt, now()));
  await Promise.allSettled(closedRounds.map((round) => resolveRound(round.id)));
}

async function ensureSettings() {
  const existing = await db.select().from(settingsTable).where(eq(settingsTable.id, "default"));
  if (existing[0]) return existing[0];
  const [created] = await db.insert(settingsTable).values({
    id: "default",
    mode: "TEST",
    tokenMints: [],
  }).returning();
  return created;
}

async function ensureRound() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('paperride:ensure-round'))`);
    const settings = await ensureSettings();
    const current = now();
    const existing = await db.select().from(roundsTable).where(and(
      eq(roundsTable.mode, settings.mode),
    )).orderBy(desc(roundsTable.opensAt), desc(roundsTable.id)).limit(1);
    const round = existing[0];
    if (round && round.closesAt > current) return round;
    if (round) await resolveRound(round.id);
    const duration = settings.mode === "TEST" ? 5 * 60_000 : 60 * 60_000;
    const [created] = await db.insert(roundsTable).values({
      id: id("round"),
      mode: settings.mode,
      opensAt: current,
      closesAt: new Date(current.getTime() + duration),
      resolvesAt: new Date(current.getTime() + duration),
      participantCount: "0",
    }).returning();
    return created;
  });
}

async function marketsFor(assetIds: string[]) {
  const resolved = await Promise.allSettled(assetIds.map((assetId) => resolveMarket(
    assetId.startsWith("solana:") ? assetId : `solana:${assetId}`,
  )));
  return resolved.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
}

router.get("/competition/current", async (req, res): Promise<void> => {
  const round = await ensureRound();
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : undefined;
  const submissions = await db.select().from(submissionsTable).where(eq(submissionsTable.roundId, round.id));
  const allResults = await db.select().from(resultsTable).where(eq(resultsTable.roundId, round.id));
  const leaderboard = submissions.map((submission) => {
    const result = allResults.find((item) => item.submissionId === submission.id);
    const returnPct = result ? Number(result.returnPct) : 0;
    return {
      wallet: submission.wallet,
      tokenSymbol: submission.tokenSymbol,
      direction: submission.direction,
      returnPct: result ? returnPct : returnPct,
      isMe: submission.wallet === wallet,
    };
  }).sort((a, b) => b.returnPct - a.returnPct).map((entry, index) => ({ ...entry, rank: index + 1 }));
  const mySubmission = submissions.find((submission) => submission.wallet === wallet);
  const response = {
    round: {
      ...round,
      participantCount: Number(round.participantCount),
    },
    tokens: [],
    leaderboard,
    totalPlayers: submissions.length,
    mySubmission: mySubmission ? {
      ...mySubmission,
      entryPrice: Number(mySubmission.entryPrice),
    } : null,
  };
  res.json(GetCurrentCompetitionResponse.parse(response));
});

router.get("/competition/markets/search", async (req, res): Promise<void> => {
  const query = typeof req.query.q === "string" ? req.query.q : "";
  if (query.trim().length < 2) {
    res.status(400).json({ error: "Enter at least two characters to search markets." });
    return;
  }
  try {
    res.json(await searchMarkets(query));
  } catch (error) {
    const message = error instanceof PricingUnavailableError
      ? error.message
      : "Market search is temporarily unavailable.";
    req.log.warn({ err: error }, "Market search unavailable");
    res.status(503).json({ error: message });
  }
});

router.post("/competition/submissions", async (req, res): Promise<void> => {
  const parsed = SubmitPaperRideBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const round = await ensureRound();
  if (round.closesAt <= now()) {
    res.status(400).json({ error: "This round has closed." });
    return;
  }
  const alreadySubmitted = await db.select().from(submissionsTable).where(and(
    eq(submissionsTable.roundId, round.id),
    eq(submissionsTable.wallet, parsed.data.wallet),
  ));
  if (alreadySubmitted[0]) {
    res.status(400).json({ error: "You already submitted a PaperRide for this round." });
    return;
  }
  await db.insert(usersTable).values({ wallet: parsed.data.wallet }).onConflictDoNothing();
  let entry;
  try {
    entry = await capturePrice(round.id, parsed.data.assetId);
  } catch (error) {
    const message = error instanceof PricingUnavailableError
      ? error.message
      : "A live entry price could not be captured.";
    req.log.warn({ err: error, assetId: parsed.data.assetId }, "PaperRide entry price unavailable");
    res.status(409).json({ error: message, code: "PRICING_UNAVAILABLE" });
    return;
  }
  const [submission] = await db.insert(submissionsTable).values({
    id: id("ride"),
    wallet: parsed.data.wallet,
    roundId: round.id,
    assetId: entry.asset.assetId,
    tokenMint: entry.asset.mint,
    tokenSymbol: entry.asset.symbol,
    direction: parsed.data.direction,
    entryPrice: String(entry.price),
  }).returning();
  await db.update(roundsTable).set({ participantCount: String(Number(round.participantCount) + 1) }).where(eq(roundsTable.id, round.id));
  res.status(201).json(SubmitPaperRideResponse.parse({
    ...submission,
    entryPrice: Number(submission.entryPrice),
  }));
});

router.get("/competition/history", async (req, res): Promise<void> => {
  const parsed = GetMyHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const submissions = await db.select({
    submission: submissionsTable,
    round: roundsTable,
    result: resultsTable,
  }).from(submissionsTable)
    .innerJoin(roundsTable, eq(roundsTable.id, submissionsTable.roundId))
    .leftJoin(resultsTable, eq(resultsTable.submissionId, submissionsTable.id))
    .where(eq(submissionsTable.wallet, parsed.data.wallet))
    .orderBy(desc(submissionsTable.entryTimestamp));
  const response = submissions.map(({ submission, round, result }) => ({
    roundId: submission.roundId,
    mode: round.mode,
    tokenSymbol: submission.tokenSymbol,
    direction: submission.direction,
    returnPct: result ? Number(result.returnPct) : 0,
    status: result ? Number(result.returnPct) >= 0 ? "WON" as const : "LOST" as const : "PENDING" as const,
    date: submission.entryTimestamp,
  }));
  res.json(GetMyHistoryResponse.parse(response));
});

router.get("/admin/settings", async (_req, res): Promise<void> => {
  const settings = await ensureSettings();
  res.json(GetAdminSettingsResponse.parse({
    mode: settings.mode,
    tokens: await marketsFor(settings.tokenMints),
  }));
});

router.patch("/admin/settings", async (req, res): Promise<void> => {
  const parsed = UpdateAdminSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [settings] = await db.update(settingsTable).set({
    mode: parsed.data.mode,
    tokenMints: parsed.data.tokenMints,
  }).where(eq(settingsTable.id, "default")).returning();
  res.json(UpdateAdminSettingsResponse.parse({
    mode: settings.mode,
    tokens: await marketsFor(settings.tokenMints),
  }));
});

export default router;