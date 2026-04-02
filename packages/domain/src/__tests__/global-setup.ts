import { execSync } from "child_process";

/**
 * Vitest globalSetup: runs once before all test files.
 * Creates the test database (if needed) and applies migrations.
 */
export async function setup() {
  const dbUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5433/dealy_test?schema=public";

  // Parse connection info for createdb
  const url = new URL(dbUrl);
  const host = url.hostname;
  const port = url.port || "5432";
  const user = url.username;
  const dbName = url.pathname.replace("/", "").split("?")[0];

  // Create the test database (idempotent)
  try {
    execSync(
      `PGPASSWORD=${url.password} psql -h ${host} -p ${port} -U ${user} -c "CREATE DATABASE ${dbName};" 2>/dev/null`,
      { stdio: "pipe" }
    );
    console.log(`Created test database: ${dbName}`);
  } catch {
    // Database already exists — fine
  }

  // Apply migrations
  execSync("npx prisma migrate deploy", {
    cwd: new URL("../../../db", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });

  console.log("Test database migrations applied.");
}
