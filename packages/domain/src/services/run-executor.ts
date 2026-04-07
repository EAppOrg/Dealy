import { prisma } from "@dealy/db";

type Source = {
  id: string;
  name: string;
  slug: string;
  baseUrl: string | null;
};

interface SearchResult {
  title: string;
  url: string;
  price: number;
  currency: string;
  seller: string;
  condition: "NEW" | "LIKE_NEW" | "REFURBISHED" | "USED_GOOD" | "USED_FAIR";
  availability: string | null;
}

/**
 * Extract price from a text string. Looks for patterns like $99.99, $1,299.00
 */
function extractPrice(text: string): number | null {
  const match = text.match(/\$[\d,]+\.?\d*/);
  if (!match) return null;
  const val = parseFloat(match[0].replace(/[$,]/g, ""));
  return val > 0 ? val : null;
}

/**
 * Search for products using DuckDuckGo HTML search.
 * DuckDuckGo serves real HTML results without JavaScript rendering,
 * making it reliable for server-side extraction.
 *
 * Returns parsed results with titles, URLs, and extracted prices.
 */
async function searchProducts(
  query: string,
  source: Source
): Promise<SearchResult[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
    query + " buy price"
  )}`;

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `Search request failed: HTTP ${response.status} from ${source.name}`
    );
  }

  const html = await response.text();
  return parseSearchResults(html, source);
}

/**
 * Parse search results from DuckDuckGo HTML.
 * Extracts result titles, URLs, and prices from snippets.
 */
function parseSearchResults(html: string, source: Source): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML search has result blocks with class "result"
  // Each has a title link and a snippet with potential price info
  const resultPattern =
    /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  let match;
  while ((match = resultPattern.exec(html)) !== null && results.length < 5) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, "").trim();
    const snippet = match[3].replace(/<[^>]+>/g, "").trim();

    // Try to extract a price from the snippet
    const price = extractPrice(snippet) ?? extractPrice(title);

    if (price && price > 1 && price < 100000 && title.length > 5) {
      results.push({
        title,
        url: url.startsWith("//") ? `https:${url}` : url,
        price,
        currency: "USD",
        seller: source.name,
        condition: "NEW",
        availability: "Check source",
      });
    }
  }

  // Fallback: scan for any price+title patterns in the HTML if structured parse found nothing
  if (results.length === 0) {
    const priceBlocks =
      /(?:<[^>]*>)([^<]{10,80})\$(\d[\d,]*\.?\d{0,2})/g;
    let pb;
    while ((pb = priceBlocks.exec(html)) !== null && results.length < 3) {
      const rawTitle = pb[1].replace(/<[^>]+>/g, "").trim();
      const price = parseFloat(pb[2].replace(/,/g, ""));
      if (price > 1 && price < 100000 && rawTitle.length > 5) {
        results.push({
          title: rawTitle.slice(0, 100),
          url: source.baseUrl ?? "https://example.com",
          price,
          currency: "USD",
          seller: source.name,
          condition: "NEW",
          availability: "Check source",
        });
      }
    }
  }

  return results;
}

/**
 * Execute a single retrieval run.
 *
 * Real execution lifecycle:
 * 1. Transitions run PENDING → RUNNING
 * 2. Fetches the intent's query
 * 3. Searches for products via web search
 * 4. Creates/updates products, sellers, and offers in DB
 * 5. Transitions run → COMPLETED (with itemsFound) or FAILED (with error)
 */
export async function executeRun(runId: string): Promise<{
  status: "COMPLETED" | "FAILED";
  itemsFound: number;
  error?: string;
}> {
  const run = await prisma.retrievalRun.findUnique({
    where: { id: runId },
    include: {
      intent: { select: { query: true, title: true } },
      source: true,
    },
  });

  if (!run) throw new Error(`Run ${runId} not found`);

  // Transition to RUNNING
  await prisma.retrievalRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  try {
    const results = await searchProducts(run.intent.query, run.source);

    if (results.length === 0) {
      await prisma.retrievalRun.update({
        where: { id: runId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          itemsFound: 0,
          metadata: { message: "Search returned no parseable product results" },
        },
      });
      return { status: "COMPLETED", itemsFound: 0 };
    }

    // Get or create seller for this source
    const seller = await prisma.seller.upsert({
      where: { slug: run.source.slug },
      create: {
        name: run.source.name,
        slug: run.source.slug,
        url: run.source.baseUrl,
        trustScore: 0.7,
      },
      update: {},
    });

    let itemsFound = 0;
    let offersReused = 0;
    let offersCreated = 0;

    for (const result of results) {
      // Dedup: check for existing offer by (sourceId, url)
      const existingOffer = await prisma.offer.findUnique({
        where: {
          sourceId_url: {
            sourceId: run.source.id,
            url: result.url,
          },
        },
      });

      let offerId: string;

      if (existingOffer) {
        // Reuse existing offer — update mutable fields and lastSeenAt
        await prisma.offer.update({
          where: { id: existingOffer.id },
          data: {
            price: result.price,
            currency: result.currency,
            condition: result.condition,
            availability: result.availability,
            title: result.title,
            lastSeenAt: new Date(),
          },
        });
        offerId = existingOffer.id;
        offersReused++;
      } else {
        // New offer — find or create canonical product
        const brand = extractBrand(result.title);
        const normalizedTitle = normalizeTitle(result.title);
        const model = extractModel(result.title, brand);

        // Tier 1: exact brand + case-insensitive normalized title match
        let product = brand
          ? await prisma.canonicalProduct.findFirst({
              where: {
                brand,
                name: { equals: normalizedTitle, mode: "insensitive" },
              },
            })
          : null;

        // Tier 2: brand + model match (with variant blocker check)
        if (!product && brand && model) {
          const modelCandidate = await prisma.canonicalProduct.findFirst({
            where: { brand, model },
          });
          if (modelCandidate) {
            const existingBlockers = extractVariantBlockers(modelCandidate.name);
            const newBlockers = extractVariantBlockers(result.title);
            if (!variantBlockersConflict(existingBlockers, newBlockers)) {
              product = modelCandidate;
            }
          }
        }

        if (!product) {
          product = await prisma.canonicalProduct.create({
            data: {
              name: normalizedTitle,
              brand,
              model,
            },
          });
        }

        try {
          const offer = await prisma.offer.create({
            data: {
              productId: product.id,
              sourceId: run.source.id,
              sellerId: seller.id,
              url: result.url,
              price: result.price,
              currency: result.currency,
              condition: result.condition,
              availability: result.availability,
              shippingCost: 0,
              title: result.title,
            },
          });
          offerId = offer.id;
          offersCreated++;
        } catch (err: unknown) {
          // Race condition: another concurrent run inserted this (sourceId, url)
          // between our findUnique check and this create. Recover gracefully.
          if (
            err &&
            typeof err === "object" &&
            "code" in err &&
            err.code === "P2002"
          ) {
            // Clean up the orphaned product we just created
            await prisma.canonicalProduct
              .delete({ where: { id: product.id } })
              .catch(() => {});

            // Find and update the race-winning offer
            const racedOffer = await prisma.offer.findUnique({
              where: {
                sourceId_url: {
                  sourceId: run.source.id,
                  url: result.url,
                },
              },
            });

            if (!racedOffer) throw err;

            await prisma.offer.update({
              where: { id: racedOffer.id },
              data: {
                price: result.price,
                currency: result.currency,
                condition: result.condition,
                availability: result.availability,
                title: result.title,
                lastSeenAt: new Date(),
              },
            });
            offerId = racedOffer.id;
            offersReused++;
          } else {
            throw err;
          }
        }
      }

      // Record run-offer association for intent scoping
      await prisma.runOffer.upsert({
        where: { runId_offerId: { runId, offerId } },
        create: { runId, offerId },
        update: {},
      });

      // Always append a new price observation
      await prisma.priceObservation.create({
        data: {
          offerId,
          price: result.price,
          currency: result.currency,
        },
      });

      itemsFound++;
    }

    await prisma.retrievalRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        itemsFound,
        metadata: {
          resultsCount: results.length,
          offersReused,
          offersCreated,
        },
      },
    });

    return { status: "COMPLETED", itemsFound };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown execution error";

    await prisma.retrievalRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        errorMessage,
      },
    });

    return { status: "FAILED", itemsFound: 0, error: errorMessage };
  }
}

/**
 * Normalize a product title for cross-source matching.
 * Trims whitespace and collapses multiple spaces to single space.
 */
function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ");
}

/**
 * Extract a model identifier from a product title.
 *
 * Looks for the first alphanumeric token (containing both letters AND digits)
 * after removing the brand name. Rejects pure numbers, pure letters, and
 * known generic descriptors.
 *
 * Examples:
 *   "Sony WH-1000XM5 Wireless Headphones" → "WH-1000XM5"
 *   "Corsair K70 RGB Keyboard"            → "K70"
 *   "Apple AirPods Pro 2"                 → null (no mixed alphanumeric token)
 *   "Dell XPS 15 Laptop"                  → "XPS15" (combined)
 */
function extractModel(title: string, brand: string | null): string | null {
  // Remove brand from title to avoid matching brand as model
  let text = title;
  if (brand) {
    text = text.replace(new RegExp(brand, "i"), "").trim();
  }

  const REJECT = new Set([
    "RGB", "USB", "LED", "LCD", "HDR", "HD", "4K", "5G", "WIFI", "PRO",
    "MAX", "PLUS", "ULTRA", "LITE", "AIR", "SE", "XL", "GT",
  ]);

  // Match hyphenated model numbers first: WH-1000XM5, WF-1000XM5, K70-RGB
  const hyphenated = text.match(/\b([A-Za-z][A-Za-z0-9]*-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\b/);
  if (hyphenated) {
    const token = hyphenated[1].toUpperCase();
    const hasLetter = /[A-Z]/.test(token);
    const hasDigit = /\d/.test(token);
    if (hasLetter && hasDigit && !REJECT.has(token)) {
      return token;
    }
  }

  // Match adjacent letter+number tokens: K70, XPS15, RTX4090
  const tokens = text.split(/\s+/);
  for (const raw of tokens) {
    const token = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (token.length < 2) continue;
    if (REJECT.has(token)) continue;

    const hasLetter = /[A-Z]/.test(token);
    const hasDigit = /\d/.test(token);
    if (hasLetter && hasDigit) {
      return token;
    }
  }

  return null;
}

/**
 * Extract variant-defining tokens from a product title.
 * These are used as blocker conditions: if two products have the same
 * brand+model but different variant tokens, they must not merge.
 *
 * Returns normalized variant strings like ["256GB", "16INCH", "M3"].
 */
function extractVariantBlockers(title: string): string[] {
  const blockers: string[] = [];
  const upper = title.toUpperCase();

  // Storage: 128GB, 256GB, 512GB, 1TB, 2TB
  const storage = upper.match(/\b(\d+)\s*(GB|TB)\b/);
  if (storage) blockers.push(storage[1] + storage[2]);

  // Screen size: 13-inch, 14", 15.6", 55", 65"
  const screen = upper.match(/\b(\d{2,3})[\s-]*(INCH|"|''|IN)\b/);
  if (screen) blockers.push(screen[1] + "INCH");

  // Apple silicon generation: M1, M2, M3, M4
  const appleChip = upper.match(/\b(M[1-4])\s*(PRO|MAX|ULTRA)?\b/);
  if (appleChip) blockers.push(appleChip[1] + (appleChip[2] || ""));

  // Generation: Gen 1, Gen 2, 1st Gen, 2nd Gen, 3rd Gen
  const gen = upper.match(/\b(?:GEN\s*(\d+)|(\d+)(?:ST|ND|RD|TH)\s*GEN)\b/);
  if (gen) blockers.push("GEN" + (gen[1] || gen[2]));

  return blockers;
}

/**
 * Check if two sets of variant blockers conflict.
 * Returns true if they conflict (merge should be blocked).
 */
function variantBlockersConflict(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;

  // Group blockers by dimension (storage, screen, chip, gen)
  const getDimension = (v: string): string => {
    if (/^\d+(GB|TB)$/.test(v)) return "storage";
    if (/^\d+INCH$/.test(v)) return "screen";
    if (/^M\d/.test(v)) return "chip";
    if (/^GEN\d/.test(v)) return "gen";
    return v;
  };

  const aMap = new Map<string, string>();
  for (const v of a) aMap.set(getDimension(v), v);

  for (const v of b) {
    const dim = getDimension(v);
    const existing = aMap.get(dim);
    if (existing && existing !== v) return true; // same dimension, different value
  }

  return false;
}

function extractBrand(title: string): string | null {
  const knownBrands = [
    // Original 20
    "Apple", "Samsung", "Sony", "LG", "Dell", "HP", "Lenovo", "Asus",
    "Acer", "Microsoft", "Google", "Bose", "JBL", "Logitech", "Corsair",
    "Razer", "Nintendo", "AMD", "Intel", "NVIDIA",
    // Batch 2: conservative expansion (29 safe product-manufacturer brands)
    "Anker", "Beats", "OnePlus", "Xiaomi", "MSI", "Roku", "Sonos",
    "Sennheiser", "Canon", "Nikon", "Panasonic", "Philips", "TCL",
    "Hisense", "Dyson", "Garmin", "Jabra", "HyperX", "SteelSeries",
    "Epson", "Toshiba", "Motorola", "DJI", "GoPro", "Fitbit",
    "Netgear", "TP-Link", "Huawei", "Vizio",
  ];
  for (const brand of knownBrands) {
    const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(title)) return brand;
  }
  return null;
}
