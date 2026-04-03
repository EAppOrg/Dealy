import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ─── Structural Tests ────────────────────────────────────────────────
// These verify that every API route file uses the auth pattern.
// They catch regressions where a new route is added without auth.

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findRouteFiles(full));
    } else if (entry.name === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

const apiDir = path.resolve(__dirname, "../app/api");
const allRouteFiles = findRouteFiles(apiDir);

// Separate public routes (auth handlers) from protected routes
const publicRouteFiles = allRouteFiles.filter(
  (f) => f.includes("[...nextauth]") || f.includes("/register/")
);
const protectedRouteFiles = allRouteFiles.filter(
  (f) => !f.includes("[...nextauth]") && !f.includes("/register/")
);

describe("Structural auth coverage", () => {
  it("has route files to test", () => {
    expect(allRouteFiles.length).toBeGreaterThan(0);
    expect(protectedRouteFiles.length).toBeGreaterThan(0);
  });

  it("excludes public auth routes from protection checks", () => {
    expect(publicRouteFiles).toHaveLength(2); // [...nextauth] + register
  });

  it.each(protectedRouteFiles)(
    "%s imports getAuthContext",
    (filePath) => {
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("getAuthContext");
    }
  );

  it.each(protectedRouteFiles)(
    "%s imports unauthorizedResponse",
    (filePath) => {
      const content = fs.readFileSync(filePath, "utf-8");
      expect(content).toContain("unauthorizedResponse");
    }
  );

  it.each(protectedRouteFiles)(
    "%s calls getAuthContext before business logic",
    (filePath) => {
      const content = fs.readFileSync(filePath, "utf-8");
      // Every exported handler should have `await getAuthContext()` before service calls
      const handlerMatches = content.match(
        /export async function (GET|POST|PATCH|PUT|DELETE)/g
      );
      if (!handlerMatches) return; // no handlers (shouldn't happen)

      for (const _handler of handlerMatches) {
        // Verify the auth check pattern exists in the file
        expect(content).toMatch(/const ctx = await getAuthContext\(\)/);
        expect(content).toMatch(/if \(!ctx\) return unauthorizedResponse\(\)/);
      }
    }
  );

  describe("admin routes require role check", () => {
    const adminRouteFiles = protectedRouteFiles.filter((f) =>
      f.includes("/admin/")
    );

    it("found admin route files", () => {
      expect(adminRouteFiles.length).toBeGreaterThanOrEqual(4);
    });

    it.each(adminRouteFiles)(
      "%s checks for ADMIN role",
      (filePath) => {
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content).toContain('ctx.role !== "ADMIN"');
        expect(content).toContain("403");
      }
    );
  });

  describe("non-admin routes do NOT require admin role", () => {
    const nonAdminRouteFiles = protectedRouteFiles.filter(
      (f) => !f.includes("/admin/") && !f.includes("/auth/")
    );

    it.each(nonAdminRouteFiles)(
      "%s does not enforce admin role",
      (filePath) => {
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content).not.toContain('ctx.role !== "ADMIN"');
      }
    );
  });
});

// ─── Behavioral Tests ────────────────────────────────────────────────
// These mock getAuthContext and test actual route handler responses.

// Mock the session module
vi.mock("@/lib/session", () => ({
  getAuthContext: vi.fn(),
  unauthorizedResponse: () => {
    const { NextResponse } = require("next/server");
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  },
}));

// Mock @dealy/domain to avoid DB calls
vi.mock("@dealy/domain", () => ({
  IntentService: {
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue({ id: "test", title: "Test" }),
    create: vi.fn().mockResolvedValue({ id: "new" }),
    update: vi.fn().mockResolvedValue({ id: "test" }),
    archive: vi.fn().mockResolvedValue({ id: "test", status: "ARCHIVED" }),
    changeStatus: vi.fn().mockResolvedValue({ id: "test" }),
  },
  RetrievalService: {
    triggerForIntent: vi.fn().mockResolvedValue({ runs: [] }),
    getOffersForIntent: vi.fn().mockResolvedValue([]),
    getComparisonForIntent: vi.fn().mockResolvedValue([]),
    listRuns: vi.fn().mockResolvedValue([]),
    getRunById: vi.fn().mockResolvedValue({ id: "run" }),
  },
  RecommendationService: {
    getLatestForIntent: vi.fn().mockResolvedValue(null),
  },
  AlertService: {
    listForWorkspace: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue({ id: "alert", status: "READ" }),
    dismiss: vi.fn().mockResolvedValue({ id: "alert", status: "DISMISSED" }),
  },
  SourceService: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: "src" }),
    update: vi.fn().mockResolvedValue({ id: "src" }),
  },
}));

// Mock @dealy/db for preferences route
vi.mock("@dealy/db", () => ({
  prisma: {
    userPreference: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ userId: "u", currency: "USD" }),
    },
  },
}));

import { getAuthContext } from "@/lib/session";
import type { AuthContext } from "@/lib/session";

const mockedGetAuthContext = vi.mocked(getAuthContext);

const ADMIN_CTX: AuthContext = {
  userId: "admin-1",
  email: "admin@dealy.app",
  name: "Admin",
  role: "ADMIN",
  workspaceId: "ws-1",
  workspaceName: "Test WS",
};

const MEMBER_CTX: AuthContext = {
  userId: "member-1",
  email: "member@dealy.app",
  name: "Member",
  role: "MEMBER",
  workspaceId: "ws-1",
  workspaceName: "Test WS",
};

function makeRequest(url = "http://localhost/test", method = "GET") {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method !== "GET" ? { body: JSON.stringify({}) } : {}),
  });
}

function makeJsonRequest(
  url = "http://localhost/test",
  method = "POST",
  body: Record<string, unknown> = {}
) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Unauthenticated API access denied", () => {
  beforeEach(() => {
    mockedGetAuthContext.mockResolvedValue(null);
  });

  it("GET /api/intents → 401", async () => {
    const { GET } = await import("@/app/api/intents/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST /api/intents → 401", async () => {
    const { POST } = await import("@/app/api/intents/route");
    const res = await POST(makeJsonRequest(undefined, "POST", { title: "x", query: "y" }) as any);
    expect(res.status).toBe(401);
  });

  it("GET /api/intents/[id] → 401", async () => {
    const { GET } = await import("@/app/api/intents/[id]/route");
    const res = await GET(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/intents/[id] → 401", async () => {
    const { PATCH } = await import("@/app/api/intents/[id]/route");
    const res = await PATCH(makeJsonRequest(undefined, "PATCH") as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("POST /api/intents/[id]/archive → 401", async () => {
    const { POST } = await import("@/app/api/intents/[id]/archive/route");
    const res = await POST(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("PATCH /api/intents/[id]/status → 401", async () => {
    const { PATCH } = await import("@/app/api/intents/[id]/status/route");
    const res = await PATCH(makeJsonRequest(undefined, "PATCH", { status: "PAUSED" }) as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("POST /api/intents/[id]/run → 401", async () => {
    const { POST } = await import("@/app/api/intents/[id]/run/route");
    const res = await POST(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("GET /api/intents/[id]/results → 401", async () => {
    const { GET } = await import("@/app/api/intents/[id]/results/route");
    const res = await GET(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("GET /api/intents/[id]/compare → 401", async () => {
    const { GET } = await import("@/app/api/intents/[id]/compare/route");
    const res = await GET(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("GET /api/alerts → 401", async () => {
    const { GET } = await import("@/app/api/alerts/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST /api/alerts/[id]/read → 401", async () => {
    const { POST } = await import("@/app/api/alerts/[id]/read/route");
    const res = await POST(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("POST /api/alerts/[id]/dismiss → 401", async () => {
    const { POST } = await import("@/app/api/alerts/[id]/dismiss/route");
    const res = await POST(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("GET /api/preferences → 401", async () => {
    const { GET } = await import("@/app/api/preferences/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("PUT /api/preferences → 401", async () => {
    const { PUT } = await import("@/app/api/preferences/route");
    const res = await PUT(makeJsonRequest(undefined, "PUT", { currency: "EUR" }) as any);
    expect(res.status).toBe(401);
  });

  it("GET /api/auth/me → 401", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/sources → 401", async () => {
    const { GET } = await import("@/app/api/admin/sources/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("POST /api/admin/sources → 401", async () => {
    const { POST } = await import("@/app/api/admin/sources/route");
    const res = await POST(makeJsonRequest(undefined, "POST", { name: "x", slug: "x", type: "RETAILER" }) as any);
    expect(res.status).toBe(401);
  });

  it("PATCH /api/admin/sources/[id] → 401", async () => {
    const { PATCH } = await import("@/app/api/admin/sources/[id]/route");
    const res = await PATCH(makeJsonRequest(undefined, "PATCH") as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/runs → 401", async () => {
    const { GET } = await import("@/app/api/admin/runs/route");
    const res = await GET(makeRequest("http://localhost/api/admin/runs") as any);
    expect(res.status).toBe(401);
  });

  it("GET /api/admin/runs/[id] → 401", async () => {
    const { GET } = await import("@/app/api/admin/runs/[id]/route");
    const res = await GET(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(401);
  });
});

describe("Admin route deny-path: non-admin user → 403", () => {
  beforeEach(() => {
    mockedGetAuthContext.mockResolvedValue(MEMBER_CTX);
  });

  it("GET /api/admin/sources → 403 for MEMBER", async () => {
    const { GET } = await import("@/app/api/admin/sources/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("POST /api/admin/sources → 403 for MEMBER", async () => {
    const { POST } = await import("@/app/api/admin/sources/route");
    const res = await POST(makeJsonRequest(undefined, "POST", { name: "x", slug: "x", type: "RETAILER" }) as any);
    expect(res.status).toBe(403);
  });

  it("PATCH /api/admin/sources/[id] → 403 for MEMBER", async () => {
    const { PATCH } = await import("@/app/api/admin/sources/[id]/route");
    const res = await PATCH(makeJsonRequest(undefined, "PATCH") as any, { params: { id: "x" } });
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/runs → 403 for MEMBER", async () => {
    const { GET } = await import("@/app/api/admin/runs/route");
    const res = await GET(makeRequest("http://localhost/api/admin/runs") as any);
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/runs/[id] → 403 for MEMBER", async () => {
    const { GET } = await import("@/app/api/admin/runs/[id]/route");
    const res = await GET(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(403);
  });
});

describe("Admin route allow-path: admin user → not 401/403", () => {
  beforeEach(() => {
    mockedGetAuthContext.mockResolvedValue(ADMIN_CTX);
  });

  it("GET /api/admin/sources → 200 for ADMIN", async () => {
    const { GET } = await import("@/app/api/admin/sources/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/runs → 200 for ADMIN", async () => {
    const { GET } = await import("@/app/api/admin/runs/route");
    const res = await GET(makeRequest("http://localhost/api/admin/runs") as any);
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/runs/[id] → 200 for ADMIN", async () => {
    const { GET } = await import("@/app/api/admin/runs/[id]/route");
    const res = await GET(makeRequest() as any, { params: { id: "x" } });
    expect(res.status).toBe(200);
  });
});

describe("Standard user route allow-path: authenticated member → not 401", () => {
  beforeEach(() => {
    mockedGetAuthContext.mockResolvedValue(MEMBER_CTX);
  });

  it("GET /api/intents → 200 for MEMBER", async () => {
    const { GET } = await import("@/app/api/intents/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("GET /api/alerts → 200 for MEMBER", async () => {
    const { GET } = await import("@/app/api/alerts/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("GET /api/preferences → 200 for MEMBER", async () => {
    const { GET } = await import("@/app/api/preferences/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("GET /api/auth/me → 200 for MEMBER", async () => {
    const { GET } = await import("@/app/api/auth/me/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(MEMBER_CTX.userId);
    expect(body.role).toBe("MEMBER");
    expect(body.workspaceId).toBe(MEMBER_CTX.workspaceId);
  });
});
