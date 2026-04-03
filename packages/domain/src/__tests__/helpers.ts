import { prisma } from "@dealy/db";
import { randomUUID } from "crypto";

/**
 * Truncate all tables in dependency-safe order.
 * Call this in beforeEach() for test isolation.
 */
export async function cleanDatabase() {
  await prisma.alertEvent.deleteMany();
  await prisma.recommendationSnapshot.deleteMany();
  await prisma.priceObservation.deleteMany();
  await prisma.runOffer.deleteMany();
  await prisma.retrievalRun.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.canonicalProduct.deleteMany();
  await prisma.productFamily.deleteMany();
  await prisma.seller.deleteMany();
  await prisma.source.deleteMany();
  await prisma.shoppingIntent.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Create a workspace with an owner user. Returns both.
 */
export async function createTestWorkspace() {
  const uid = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      email: `test-${uid}@dealy.app`,
      name: "Test User",
      role: "ADMIN",
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-workspace-${uid}`,
    },
  });

  await prisma.workspaceMember.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      role: "OWNER",
    },
  });

  return { user, workspace };
}

/**
 * Create an enabled source. Returns the source.
 */
export async function createTestSource(
  overrides: { name?: string; slug?: string; type?: "RETAILER" | "MARKETPLACE" } = {}
) {
  return prisma.source.create({
    data: {
      name: overrides.name ?? "Test Source",
      slug: overrides.slug ?? `test-source-${Date.now()}`,
      type: overrides.type ?? "RETAILER",
      baseUrl: "https://example.com",
      enabled: true,
    },
  });
}

/**
 * Create a product with a seller and an offer. Returns all three.
 */
export async function createTestOffer(opts: {
  sourceId: string;
  price: number;
  shippingCost?: number;
  condition?: "NEW" | "LIKE_NEW" | "REFURBISHED" | "USED_GOOD" | "USED_FAIR";
  trustScore?: number;
}) {
  const product = await prisma.canonicalProduct.create({
    data: {
      name: `Product ${Date.now()}`,
      brand: "TestBrand",
    },
  });

  const seller = await prisma.seller.create({
    data: {
      name: `Seller ${Date.now()}`,
      slug: `seller-${Date.now()}`,
      trustScore: opts.trustScore ?? 0.8,
    },
  });

  const offer = await prisma.offer.create({
    data: {
      productId: product.id,
      sourceId: opts.sourceId,
      sellerId: seller.id,
      url: `https://example.com/offer/${Date.now()}`,
      price: opts.price,
      shippingCost: opts.shippingCost ?? 0,
      condition: opts.condition ?? "NEW",
      title: product.name,
    },
  });

  return { product, seller, offer };
}
