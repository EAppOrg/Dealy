import type { CanonicalProduct, Offer, OfferCondition } from "@dealy/db";

export type ProductSummary = Pick<
  CanonicalProduct,
  "id" | "name" | "brand" | "model" | "imageUrl"
>;

export type OfferSummary = Pick<
  Offer,
  | "id"
  | "productId"
  | "sourceId"
  | "sellerId"
  | "url"
  | "price"
  | "currency"
  | "condition"
  | "availability"
  | "shippingCost"
  | "title"
  | "imageUrl"
  | "lastSeenAt"
>;

export interface OfferWithProduct extends OfferSummary {
  product: ProductSummary;
  sourceName: string;
  sellerName?: string;
}

export interface ComparisonRow {
  offerId: string;
  productName: string;
  sellerName: string | null;
  sourceName: string;
  price: number;
  shippingCost: number | null;
  totalCost: number;
  condition: OfferCondition;
  url: string;
  lastSeenAt: Date;
}
