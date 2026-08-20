import { Router, type IRouter } from "express";
import { and, desc, eq, lte } from "drizzle-orm";
import { db, priceSnapshotsTable, roundsTable, settingsTable, submissionsTable, resultsTable, usersTable } from "@workspace/db";
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

const tokenCatalog = [
  { mint: "So11111111111111111111111111111111111111112", symbol: "SOL", name: "Solana", price: 184.42, change24h: 4.82 },
  { mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6GxN7z6o9F7K7w", symbol: "BONK", name: "Bonk", price: 0.0000284, change24h: -1.14 },
  { mint: "H8sKcP6S8YxYfR7dT3VxYzW2mQ9kL4nB6cA1pE5rU8", symbol: "cbBTC", name: "Coinbase Wrapped BTC", price: 104820.18, change24h: 1.62 },
  { mint: "HYPE111111111111111111111111111111111111111", symbol: "HYPE", name: "Hyperliquid", price: 42.16, change24h: 7.31 },
];

const now = () => new Date();
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function fetchMarketPrice(mint: string): Promise<{ price: number; source: string } | null> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, {
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number } }> };
    const pair = payload.pairs
      ?.filter((candidate) => Number(candidate.priceUsd) > 0)
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const price = Number(pair?.priceUsd);
    return Number.isFinite(price) && price > 0 ? { price, source: "dexscreener" } : null;
  } catch {
    return null;
  }
}

async function capturePrice(roundId: string, mint: string, fallback: number) {
  const livePrice = await fetchMarketPrice(mint);
  const snapshot = {
    id: id("price"),
    roundId,
    tokenMint: mint,
    price: String(livePrice?.price ?? fallback),
    source: livePrice?.source ?? "development-fallback",
  };
  await db.insert(priceSnapshotsTable).values(snapshot);
  return { price: Number(snapshot.price), source: snapshot.source };
}

async function resolveRound(roundId: string) {
  const submissions = await db.select().from(submissionsTable).where(eq(submissionsTable.roundId, roundId));
  await Promise.allSettled(submissions.map(async (submission) => {
    const previous = await db.select().from(resultsTable).where(eq(resultsTable.submissionId, submission.id));
    if (previous[0]) return;
    const token = tokenCatalog.find((candidate) => candidate.mint === submission.tokenMint);
    if (!token) return;
    const exit = await capturePrice(roundId, submission.tokenMint, token.price);
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
    tokenMints: tokenCatalog.map((token) => token.mint),
  }).returning();
  return created;
}

async function ensureRound() {
  const settings = await ensureSettings();
  const current = now();
  const existing = await db.select().from(roundsTable).where(and(
    eq(roundsTable.mode, settings.mode),
  )).orderBy(desc(roundsTable.opensAt)).limit(1);
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
}

function tokensFor(mints: string[]) {
  return tokenCatalog.filter((token) => mints.includes(token.mint));
}

router.get("/competition/current", async (req, res): Promise<void> => {
  const settings = await ensureSettings();
  const round = await ensureRound();
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : undefined;
  const submissions = await db.select().from(submissionsTable).where(eq(submissionsTable.roundId, round.id));
  const allResults = await db.select().from(resultsTable).where(eq(resultsTable.roundId, round.id));
  const leaderboard = submissions.map((submission) => {
    const result = allResults.find((item) => item.submissionId === submission.id);
    const entry = Number(submission.entryPrice);
    const exit = result ? Number(result.exitPrice) : entry;
    const returnPct = result ? Number(result.returnPct) : submission.direction === "LONG" ? 0.84 : -0.84;
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
    tokens: tokensFor(settings.tokenMints),
    leaderboard,
    totalPlayers: submissions.length,
    mySubmission: mySubmission ? {
      ...mySubmission,
      entryPrice: Number(mySubmission.entryPrice),
    } : null,
  };
  res.json(GetCurrentCompetitionResponse.parse(response));
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
  const settings = await ensureSettings();
  const token = tokenCatalog.find((candidate) => candidate.mint === parsed.data.tokenMint && settings.tokenMints.includes(candidate.mint));
  if (!token) {
    res.status(400).json({ error: "That token is not eligible for this round." });
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
  const entry = await capturePrice(round.id, token.mint, token.price);
  const [submission] = await db.insert(submissionsTable).values({
    id: id("ride"),
    wallet: parsed.data.wallet,
    roundId: round.id,
    tokenMint: token.mint,
    tokenSymbol: token.symbol,
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
  const submissions = await db.select().from(submissionsTable).where(eq(submissionsTable.wallet, parsed.data.wallet));
  const response = submissions.map((submission) => ({
    roundId: submission.roundId,
    mode: "TEST" as const,
    tokenSymbol: submission.tokenSymbol,
    direction: submission.direction,
    returnPct: 0,
    status: "PENDING" as const,
    date: submission.entryTimestamp,
  }));
  res.json(GetMyHistoryResponse.parse(response));
});

router.get("/admin/settings", async (_req, res): Promise<void> => {
  const settings = await ensureSettings();
  res.json(GetAdminSettingsResponse.parse({
    mode: settings.mode,
    tokens: tokensFor(settings.tokenMints),
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
    tokens: tokensFor(settings.tokenMints),
  }));
});

export default router;