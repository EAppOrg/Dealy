import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Dealy database...");
  const passwordHash = await bcrypt.hash("dealy123", 10);

  // ─── Clean slate ──────────────────────────────────────────────────
  await prisma.alertEvent.deleteMany();
  await prisma.recommendationSnapshot.deleteMany();
  await prisma.priceObservation.deleteMany();
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

  // ─── Users ────────────────────────────────────────────────────────
  const adminUser = await prisma.user.create({
    data: {
      id: "seed-user-admin",
      email: "admin@dealy.app",
      name: "Alex Chen",
      passwordHash,
      role: "ADMIN",
    },
  });

  const memberUser = await prisma.user.create({
    data: {
      id: "seed-user-member",
      email: "jordan@dealy.app",
      name: "Jordan Lee",
      passwordHash,
      role: "MEMBER",
    },
  });

  console.log(`  Created ${2} users`);

  // ─── Workspace ────────────────────────────────────────────────────
  const workspace = await prisma.workspace.create({
    data: {
      id: "seed-workspace-001",
      name: "Dealy HQ",
      slug: "dealy-hq",
    },
  });

  await prisma.workspaceMember.createMany({
    data: [
      { userId: adminUser.id, workspaceId: workspace.id, role: "OWNER" },
      { userId: memberUser.id, workspaceId: workspace.id, role: "MEMBER" },
    ],
  });

  console.log(`  Created workspace "${workspace.name}" with 2 members`);

  // ─── User Preferences ────────────────────────────────────────────
  await prisma.userPreference.create({
    data: {
      userId: adminUser.id,
      currency: "USD",
      locale: "en-US",
      alertEmail: true,
      alertPush: false,
      maxBudgetAlert: 2000,
    },
  });

  console.log("  Created user preferences");

  // ─── Sources ──────────────────────────────────────────────────────
  const sourceAmazon = await prisma.source.create({
    data: {
      name: "Amazon",
      slug: "amazon",
      type: "MARKETPLACE",
      baseUrl: "https://www.amazon.com",
      enabled: true,
      config: { region: "us", marketplace_id: "ATVPDKIKX0DER" },
    },
  });

  const sourceBestBuy = await prisma.source.create({
    data: {
      name: "Best Buy",
      slug: "best-buy",
      type: "RETAILER",
      baseUrl: "https://www.bestbuy.com",
      enabled: true,
    },
  });

  const sourceNewegg = await prisma.source.create({
    data: {
      name: "Newegg",
      slug: "newegg",
      type: "RETAILER",
      baseUrl: "https://www.newegg.com",
      enabled: true,
    },
  });

  const sourceEbay = await prisma.source.create({
    data: {
      name: "eBay",
      slug: "ebay",
      type: "MARKETPLACE",
      baseUrl: "https://www.ebay.com",
      enabled: false, // disabled for now
    },
  });

  console.log(`  Created ${4} sources`);

  // ─── Sellers ──────────────────────────────────────────────────────
  const sellerAmazonDirect = await prisma.seller.create({
    data: {
      name: "Amazon.com",
      slug: "amazon-direct",
      url: "https://www.amazon.com",
      rating: 4.7,
      trustScore: 0.95,
    },
  });

  const sellerBestBuyDirect = await prisma.seller.create({
    data: {
      name: "Best Buy",
      slug: "bestbuy-direct",
      url: "https://www.bestbuy.com",
      rating: 4.5,
      trustScore: 0.92,
    },
  });

  const sellerNeweggDirect = await prisma.seller.create({
    data: {
      name: "Newegg",
      slug: "newegg-direct",
      url: "https://www.newegg.com",
      rating: 4.3,
      trustScore: 0.88,
    },
  });

  const sellerThirdParty = await prisma.seller.create({
    data: {
      name: "TechDeals Outlet",
      slug: "techdeals-outlet",
      url: "https://www.amazon.com/shops/techdeals",
      rating: 4.1,
      trustScore: 0.72,
    },
  });

  console.log(`  Created ${4} sellers`);

  // ─── Product Families ─────────────────────────────────────────────
  const familyLaptops = await prisma.productFamily.create({
    data: {
      name: "Laptops",
      slug: "laptops",
      category: "Electronics",
      description: "Portable computers",
    },
  });

  const familyHeadphones = await prisma.productFamily.create({
    data: {
      name: "Headphones",
      slug: "headphones",
      category: "Electronics",
      description: "Audio headphones and earbuds",
    },
  });

  console.log(`  Created ${2} product families`);

  // ─── Canonical Products ───────────────────────────────────────────
  const productMBP = await prisma.canonicalProduct.create({
    data: {
      familyId: familyLaptops.id,
      name: 'MacBook Pro 16" M3 Pro',
      brand: "Apple",
      model: "MBP16-M3PRO-2024",
      asin: "B0CM5JV268",
      imageUrl: "https://placeholder.test/mbp16.jpg",
      specifications: {
        cpu: "Apple M3 Pro",
        ram: "18GB",
        storage: "512GB SSD",
        display: '16.2" Liquid Retina XDR',
      },
    },
  });

  const productMBP14 = await prisma.canonicalProduct.create({
    data: {
      familyId: familyLaptops.id,
      name: 'MacBook Pro 14" M3',
      brand: "Apple",
      model: "MBP14-M3-2024",
      asin: "B0CM5BL45N",
      imageUrl: "https://placeholder.test/mbp14.jpg",
      specifications: {
        cpu: "Apple M3",
        ram: "8GB",
        storage: "512GB SSD",
        display: '14.2" Liquid Retina XDR',
      },
    },
  });

  const productXM5 = await prisma.canonicalProduct.create({
    data: {
      familyId: familyHeadphones.id,
      name: "Sony WH-1000XM5",
      brand: "Sony",
      model: "WH-1000XM5",
      asin: "B0BX2L8PBG",
      imageUrl: "https://placeholder.test/xm5.jpg",
      specifications: {
        type: "Over-ear",
        anc: true,
        battery: "30 hours",
        driver: "30mm",
      },
    },
  });

  const productAPMax = await prisma.canonicalProduct.create({
    data: {
      familyId: familyHeadphones.id,
      name: "AirPods Max",
      brand: "Apple",
      model: "AIRPODS-MAX-2",
      asin: "B0D5SH3MGH",
      imageUrl: "https://placeholder.test/airpods-max.jpg",
      specifications: {
        type: "Over-ear",
        anc: true,
        chip: "H2",
        battery: "20 hours",
      },
    },
  });

  console.log(`  Created ${4} canonical products`);

  // ─── Shopping Intents ─────────────────────────────────────────────
  const intentLaptop = await prisma.shoppingIntent.create({
    data: {
      workspaceId: workspace.id,
      title: "New development laptop",
      description:
        "Looking for a MacBook Pro 16-inch for software development. Need strong multi-core performance and at least 16GB RAM.",
      query: "MacBook Pro 16 M3 Pro 2024",
      status: "ACTIVE",
      priority: "HIGH",
      budgetMin: 1800,
      budgetMax: 2800,
      currency: "USD",
      monitorEnabled: true,
      monitorInterval: 360,
    },
  });

  const intentHeadphones = await prisma.shoppingIntent.create({
    data: {
      workspaceId: workspace.id,
      title: "Noise-cancelling headphones for office",
      description:
        "Need premium ANC headphones for open-plan office. Comparing Sony XM5 vs AirPods Max.",
      query: "Sony WH-1000XM5 OR AirPods Max",
      status: "MONITORING",
      priority: "MEDIUM",
      budgetMin: 250,
      budgetMax: 600,
      currency: "USD",
      monitorEnabled: true,
      monitorInterval: 720,
    },
  });

  const intentDraft = await prisma.shoppingIntent.create({
    data: {
      workspaceId: workspace.id,
      title: "Standing desk research",
      description: "Exploring standing desk options for the home office.",
      query: "standing desk electric adjustable",
      status: "DRAFT",
      priority: "LOW",
      budgetMax: 800,
      currency: "USD",
      monitorEnabled: false,
    },
  });

  console.log(`  Created ${3} shopping intents`);

  // ─── Offers ───────────────────────────────────────────────────────
  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);

  const offerMBP_Amazon = await prisma.offer.create({
    data: {
      productId: productMBP.id,
      sourceId: sourceAmazon.id,
      sellerId: sellerAmazonDirect.id,
      url: "https://www.amazon.com/dp/B0CM5JV268",
      price: 2399.0,
      currency: "USD",
      condition: "NEW",
      availability: "In Stock",
      shippingCost: 0,
      shippingNote: "Free Prime shipping",
      title: 'Apple MacBook Pro 16" M3 Pro 18GB 512GB - Space Black',
      lastSeenAt: hoursAgo(2),
      firstSeenAt: hoursAgo(72),
    },
  });

  const offerMBP_BestBuy = await prisma.offer.create({
    data: {
      productId: productMBP.id,
      sourceId: sourceBestBuy.id,
      sellerId: sellerBestBuyDirect.id,
      url: "https://www.bestbuy.com/site/macbook-pro-16/6534615.p",
      price: 2349.99,
      currency: "USD",
      condition: "NEW",
      availability: "In Stock",
      shippingCost: 0,
      shippingNote: "Free shipping",
      title: 'MacBook Pro 16" - Apple M3 Pro - 18GB Memory - 512GB SSD',
      lastSeenAt: hoursAgo(1),
      firstSeenAt: hoursAgo(48),
    },
  });

  const offerMBP_ThirdParty = await prisma.offer.create({
    data: {
      productId: productMBP.id,
      sourceId: sourceAmazon.id,
      sellerId: sellerThirdParty.id,
      url: "https://www.amazon.com/dp/B0CM5JV268?m=A1TECHDEALS",
      price: 2199.0,
      currency: "USD",
      condition: "LIKE_NEW",
      availability: "Only 3 left",
      shippingCost: 12.99,
      shippingNote: "Standard shipping 3-5 days",
      title: 'MacBook Pro 16" M3 Pro - Open Box',
      lastSeenAt: hoursAgo(6),
      firstSeenAt: hoursAgo(24),
    },
  });

  const offerXM5_Amazon = await prisma.offer.create({
    data: {
      productId: productXM5.id,
      sourceId: sourceAmazon.id,
      sellerId: sellerAmazonDirect.id,
      url: "https://www.amazon.com/dp/B0BX2L8PBG",
      price: 328.0,
      currency: "USD",
      condition: "NEW",
      availability: "In Stock",
      shippingCost: 0,
      title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones - Black",
      lastSeenAt: hoursAgo(3),
      firstSeenAt: hoursAgo(96),
    },
  });

  const offerXM5_BestBuy = await prisma.offer.create({
    data: {
      productId: productXM5.id,
      sourceId: sourceBestBuy.id,
      sellerId: sellerBestBuyDirect.id,
      url: "https://www.bestbuy.com/site/sony-wh1000xm5/6505727.p",
      price: 299.99,
      currency: "USD",
      condition: "NEW",
      availability: "In Stock",
      shippingCost: 0,
      title: "Sony WH-1000XM5 Wireless Noise-Canceling Over-the-Ear Headphones",
      lastSeenAt: hoursAgo(1),
      firstSeenAt: hoursAgo(120),
    },
  });

  const offerAPMax_Amazon = await prisma.offer.create({
    data: {
      productId: productAPMax.id,
      sourceId: sourceAmazon.id,
      sellerId: sellerAmazonDirect.id,
      url: "https://www.amazon.com/dp/B0D5SH3MGH",
      price: 549.0,
      currency: "USD",
      condition: "NEW",
      availability: "In Stock",
      shippingCost: 0,
      title: "Apple AirPods Max (USB-C) - Midnight",
      lastSeenAt: hoursAgo(4),
      firstSeenAt: hoursAgo(48),
    },
  });

  const offerXM5_Newegg = await prisma.offer.create({
    data: {
      productId: productXM5.id,
      sourceId: sourceNewegg.id,
      sellerId: sellerNeweggDirect.id,
      url: "https://www.newegg.com/p/0TH-00XM-00123",
      price: 309.99,
      currency: "USD",
      condition: "NEW",
      availability: "In Stock",
      shippingCost: 4.99,
      title: "Sony WH-1000XM5 Wireless NC Headphones",
      lastSeenAt: hoursAgo(8),
      firstSeenAt: hoursAgo(72),
    },
  });

  console.log(`  Created ${7} offers`);

  // ─── Price Observations ───────────────────────────────────────────
  const observations = [
    { offerId: offerMBP_Amazon.id, price: 2499.0, observedAt: hoursAgo(72) },
    { offerId: offerMBP_Amazon.id, price: 2449.0, observedAt: hoursAgo(48) },
    { offerId: offerMBP_Amazon.id, price: 2399.0, observedAt: hoursAgo(2) },
    { offerId: offerMBP_BestBuy.id, price: 2399.99, observedAt: hoursAgo(48) },
    { offerId: offerMBP_BestBuy.id, price: 2349.99, observedAt: hoursAgo(1) },
    { offerId: offerXM5_Amazon.id, price: 348.0, observedAt: hoursAgo(96) },
    { offerId: offerXM5_Amazon.id, price: 328.0, observedAt: hoursAgo(3) },
    { offerId: offerXM5_BestBuy.id, price: 349.99, observedAt: hoursAgo(120) },
    { offerId: offerXM5_BestBuy.id, price: 329.99, observedAt: hoursAgo(72) },
    { offerId: offerXM5_BestBuy.id, price: 299.99, observedAt: hoursAgo(1) },
    { offerId: offerAPMax_Amazon.id, price: 549.0, observedAt: hoursAgo(48) },
    { offerId: offerAPMax_Amazon.id, price: 549.0, observedAt: hoursAgo(4) },
  ];

  await prisma.priceObservation.createMany({ data: observations });
  console.log(`  Created ${observations.length} price observations`);

  // ─── Retrieval Runs ───────────────────────────────────────────────
  // Laptop intent: completed runs for Amazon and BestBuy
  await prisma.retrievalRun.create({
    data: {
      intentId: intentLaptop.id,
      sourceId: sourceAmazon.id,
      status: "COMPLETED",
      startedAt: hoursAgo(3),
      completedAt: hoursAgo(2.9),
      itemsFound: 2,
    },
  });

  await prisma.retrievalRun.create({
    data: {
      intentId: intentLaptop.id,
      sourceId: sourceBestBuy.id,
      status: "COMPLETED",
      startedAt: hoursAgo(3),
      completedAt: hoursAgo(2.8),
      itemsFound: 1,
    },
  });

  // Headphones intent: completed runs for all three enabled sources
  await prisma.retrievalRun.create({
    data: {
      intentId: intentHeadphones.id,
      sourceId: sourceAmazon.id,
      status: "COMPLETED",
      startedAt: hoursAgo(5),
      completedAt: hoursAgo(4.9),
      itemsFound: 2,
    },
  });

  await prisma.retrievalRun.create({
    data: {
      intentId: intentHeadphones.id,
      sourceId: sourceBestBuy.id,
      status: "COMPLETED",
      startedAt: hoursAgo(5),
      completedAt: hoursAgo(4.8),
      itemsFound: 1,
    },
  });

  await prisma.retrievalRun.create({
    data: {
      intentId: intentHeadphones.id,
      sourceId: sourceNewegg.id,
      status: "COMPLETED",
      startedAt: hoursAgo(5),
      completedAt: hoursAgo(4.7),
      itemsFound: 1,
    },
  });

  // A failed run
  await prisma.retrievalRun.create({
    data: {
      intentId: intentLaptop.id,
      sourceId: sourceNewegg.id,
      status: "FAILED",
      startedAt: hoursAgo(3),
      completedAt: hoursAgo(2.95),
      itemsFound: 0,
      errorMessage: "HTTP 429 Too Many Requests — rate limited by source",
    },
  });

  console.log("  Created 6 retrieval runs");

  // ─── Recommendation Snapshots ─────────────────────────────────────
  // Laptop intent recommendation
  await prisma.recommendationSnapshot.create({
    data: {
      intentId: intentLaptop.id,
      version: 1,
      rankedOfferIds: [
        offerMBP_ThirdParty.id,
        offerMBP_BestBuy.id,
        offerMBP_Amazon.id,
      ],
      explanation:
        "Baseline ranking of 3 offer(s) by total cost with seller trust and recency adjustments. " +
        "Algorithm: baseline-v1. Confidence is moderate due to reasonable offer coverage. " +
        "The open-box offer from TechDeals Outlet has the lowest total cost ($2,211.99) but lower seller trust (0.72).",
      confidence: 0.6,
      algorithm: "baseline-v1",
    },
  });

  // Headphones intent recommendation
  await prisma.recommendationSnapshot.create({
    data: {
      intentId: intentHeadphones.id,
      version: 1,
      rankedOfferIds: [
        offerXM5_BestBuy.id,
        offerXM5_Newegg.id,
        offerXM5_Amazon.id,
        offerAPMax_Amazon.id,
      ],
      explanation:
        "Baseline ranking of 4 offer(s) by total cost with seller trust and recency adjustments. " +
        "Algorithm: baseline-v1. Confidence is moderate due to reasonable offer coverage. " +
        "Sony XM5 at Best Buy ($299.99) is the top recommendation — lowest price with high seller trust (0.92).",
      confidence: 0.65,
      algorithm: "baseline-v1",
    },
  });

  console.log("  Created 2 recommendation snapshots");

  // ─── Alert Events ─────────────────────────────────────────────────
  await prisma.alertEvent.create({
    data: {
      intentId: intentLaptop.id,
      type: "PRICE_DROP",
      title: "MacBook Pro 16\" price dropped $100 at Amazon",
      message:
        "Price dropped from $2,499.00 to $2,399.00 on Amazon.com. This is within your budget range.",
      severity: "INFO",
      status: "UNREAD",
      metadata: {
        offerId: offerMBP_Amazon.id,
        previousPrice: 2499.0,
        newPrice: 2399.0,
      },
    },
  });

  await prisma.alertEvent.create({
    data: {
      intentId: intentHeadphones.id,
      type: "PRICE_DROP",
      title: "Sony XM5 hit lowest price at Best Buy",
      message:
        "Price dropped from $349.99 to $299.99 at Best Buy. This is the lowest price we've tracked.",
      severity: "WARNING",
      status: "UNREAD",
      metadata: {
        offerId: offerXM5_BestBuy.id,
        previousPrice: 349.99,
        newPrice: 299.99,
      },
    },
  });

  await prisma.alertEvent.create({
    data: {
      intentId: intentLaptop.id,
      type: "RUN_FAILED",
      title: "Newegg retrieval failed",
      message:
        "Retrieval run for Newegg returned HTTP 429. The source may be temporarily rate-limiting requests.",
      severity: "WARNING",
      status: "READ",
      readAt: hoursAgo(1),
    },
  });

  await prisma.alertEvent.create({
    data: {
      intentId: intentHeadphones.id,
      type: "NEW_OFFER",
      title: "New offer found: AirPods Max on Amazon",
      message:
        "A new offer for AirPods Max was found on Amazon at $549.00.",
      severity: "INFO",
      status: "UNREAD",
    },
  });

  console.log("  Created 4 alert events");

  console.log("\nSeed completed successfully.");
  console.log("Summary:");
  console.log("  2 users, 1 workspace, 2 members");
  console.log("  1 user preferences record");
  console.log("  4 sources (3 enabled, 1 disabled)");
  console.log("  4 sellers");
  console.log("  2 product families, 4 canonical products");
  console.log("  7 offers across 3 sources");
  console.log("  12 price observations");
  console.log("  3 shopping intents (ACTIVE, MONITORING, DRAFT)");
  console.log("  6 retrieval runs (4 completed, 1 failed, 1 pending)");
  console.log("  2 recommendation snapshots");
  console.log("  4 alert events (3 unread, 1 read)");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
