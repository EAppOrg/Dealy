export interface RecommendationResult {
  snapshotId: string;
  intentId: string;
  version: number;
  rankedOfferIds: string[];
  explanation: string | null;
  confidence: number | null;
  algorithm: string;
  createdAt: Date;
}

export interface RankingInput {
  offerId: string;
  price: number;
  shippingCost: number | null;
  condition: string;
  sellerTrustScore: number | null;
  lastSeenAt: Date;
}
