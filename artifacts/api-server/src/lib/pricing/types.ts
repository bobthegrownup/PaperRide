export type MarketAsset = {
  assetId: string;
  provider: string;
  mint: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
};

export type PriceQuote = {
  assetId: string;
  price: number;
  source: string;
  capturedAt: Date;
};

export class PricingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingUnavailableError";
  }
}

export interface MarketPricingProvider {
  readonly name: string;
  canResolve(assetId: string): boolean;
  search(query: string): Promise<MarketAsset[]>;
  resolve(assetId: string): Promise<MarketAsset>;
  quote(assetId: string): Promise<PriceQuote>;
}