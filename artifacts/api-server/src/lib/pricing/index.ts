import { dexScreenerProvider } from "./dexscreener";
import { PricingUnavailableError, type MarketAsset, type MarketPricingProvider, type PriceQuote } from "./types";

const providers: MarketPricingProvider[] = [dexScreenerProvider];

function getProvider(assetId: string) {
  const provider = providers.find((candidate) => candidate.canResolve(assetId));
  if (!provider) throw new PricingUnavailableError("No pricing provider is configured for this market.");
  return provider;
}

export async function searchMarkets(query: string): Promise<MarketAsset[]> {
  const settled = await Promise.allSettled(providers.map((provider) => provider.search(query)));
  return settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export async function resolveMarket(assetId: string): Promise<MarketAsset> {
  return getProvider(assetId).resolve(assetId);
}

export async function quoteMarket(assetId: string): Promise<PriceQuote> {
  return getProvider(assetId).quote(assetId);
}

export { PricingUnavailableError, type MarketAsset, type PriceQuote };