import {
  type MarketAsset,
  type MarketPricingProvider,
  PricingUnavailableError,
  type PriceQuote,
} from "./types";

type DexPair = {
  chainId?: string;
  priceUsd?: string;
  priceChange?: { h24?: number };
  liquidity?: { usd?: number };
  baseToken?: { address?: string; symbol?: string; name?: string };
  quoteToken?: { address?: string; symbol?: string; name?: string };
};

const SOLANA_ASSET_PREFIX = "solana:";
const endpoint = "https://api.dexscreener.com/latest/dex";

function toAssetId(mint: string) {
  return `${SOLANA_ASSET_PREFIX}${mint}`;
}

function getMint(assetId: string) {
  if (!assetId.startsWith(SOLANA_ASSET_PREFIX)) {
    throw new PricingUnavailableError("This market is not handled by the Solana pricing provider.");
  }
  const mint = assetId.slice(SOLANA_ASSET_PREFIX.length);
  if (!mint) throw new PricingUnavailableError("The Solana asset identifier is incomplete.");
  return mint;
}

function selectLiquidPair(pairs: DexPair[] | undefined, mint?: string) {
  const relevant = (pairs ?? []).filter((pair) => {
    if (pair.chainId !== "solana" || !Number.isFinite(Number(pair.priceUsd)) || Number(pair.priceUsd) <= 0) return false;
    return !mint || pair.baseToken?.address === mint || pair.quoteToken?.address === mint;
  });
  return relevant.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

function pairToAsset(pair: DexPair, requestedMint?: string): MarketAsset {
  const matchedToken = requestedMint === pair.quoteToken?.address ? pair.quoteToken : pair.baseToken;
  const mint = matchedToken?.address;
  const price = Number(pair.priceUsd);
  if (!mint || !matchedToken?.symbol || !Number.isFinite(price) || price <= 0) {
    throw new PricingUnavailableError("A live USD price is unavailable for this market.");
  }
  return {
    assetId: toAssetId(mint),
    provider: "dexscreener",
    mint,
    symbol: matchedToken.symbol,
    name: matchedToken.name || matchedToken.symbol,
    price,
    change24h: Number(pair.priceChange?.h24 ?? 0),
  };
}

async function getDexJson(path: string) {
  try {
    const response = await fetch(`${endpoint}${path}`, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new PricingUnavailableError("The live pricing service did not return a quote.");
    return await response.json() as { pairs?: DexPair[] };
  } catch (error) {
    if (error instanceof PricingUnavailableError) throw error;
    throw new PricingUnavailableError("The live pricing service is temporarily unavailable.");
  }
}

export const dexScreenerProvider: MarketPricingProvider = {
  name: "dexscreener",
  canResolve(assetId) {
    return assetId.startsWith(SOLANA_ASSET_PREFIX);
  },
  async search(query) {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const payload = await getDexJson(`/search?q=${encodeURIComponent(trimmed)}`);
    const deduped = new Map<string, { asset: MarketAsset; liquidity: number }>();
    for (const pair of (payload.pairs ?? []).filter((candidate) => candidate.chainId === "solana")) {
      const pairMatchesQuery = [pair.baseToken?.address, pair.quoteToken?.address, pair.baseToken?.symbol, pair.baseToken?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(trimmed.toLowerCase()));
      if (!pairMatchesQuery) continue;
      try {
        const asset = pairToAsset(pair, pair.baseToken?.address);
        const liquidity = pair.liquidity?.usd ?? 0;
        if (liquidity < 10_000) continue;
        const existing = deduped.get(asset.assetId);
        if (!existing || liquidity > existing.liquidity) deduped.set(asset.assetId, { asset, liquidity });
      } catch {
        // Search results without a reliable live quote are intentionally excluded.
      }
    }
    return [...deduped.values()]
      .sort((a, b) => b.liquidity - a.liquidity)
      .slice(0, 12)
      .map((entry) => entry.asset);
  },
  async resolve(assetId) {
    const mint = getMint(assetId);
    const payload = await getDexJson(`/tokens/${encodeURIComponent(mint)}`);
    const pair = selectLiquidPair(payload.pairs, mint);
    if (!pair) throw new PricingUnavailableError("No reliable live price is available for this Solana asset.");
    return pairToAsset(pair, mint);
  },
  async quote(assetId) {
    const asset = await this.resolve(assetId);
    return {
      assetId: asset.assetId,
      price: asset.price,
      source: this.name,
      capturedAt: new Date(),
    };
  },
};