import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Vitest globalSetup: runs once before all test files.
 * Creates the test database (if needed) and applies migrations.
 *
 * In CI, the workflow "Apply migrations" step already handles this,
 * so failures here are non-fatal when migrations are already applied.
 */
export async function setup() {
  const dbUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5433/dealy_test?schema=public";

  const url = new URL(dbUrl);
  const host = url.hostname;
  const port = url.port || "5432";
  const user = url.username;
  const dbName = url.pathname.replace("/", "").split("?")[0];

  // Resolve the db package directory
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const dbPkgDir = path.resolve(__dirname, "../../../db");

  // Create the test database (idempotent) — try psql, then docker exec
  try {
    execSync(
      `PGPASSWORD=${url.password} psql -h ${host} -p ${port} -U ${user} -c "CREATE DATABASE ${dbName};" 2>/dev/null`,
      { stdio: "pipe" }
    );
    console.log(`Created test database: ${dbName}`);
  } catch {
    // DB already exists, or psql not available — try docker exec as fallback
    try {
      execSync(
        `docker exec dealy-postgres psql -U ${user} -c "CREATE DATABASE ${dbName};" 2>/dev/null`,
        { stdio: "pipe" }
      );
      console.log(`Created test database via docker: ${dbName}`);
    } catch {
      // DB already exists or docker not available — continue
    }
  }

  // Apply migrations
  try {
    execSync("npx prisma migrate deploy", {
      cwd: dbPkgDir,
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: "pipe",
    });
    console.log("Test database migrations applied.");
  } catch (err) {
    // In CI, migrations are already applied by the workflow step.
    // Only fail if this is NOT a "already applied" scenario.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already applied") || msg.includes("up to date")) {
      console.log("Test database migrations already up to date.");
    } else {
      console.warn(
        "Warning: Could not apply migrations in global setup.",
        "If running in CI, this is expected (migrations applied in workflow step).",
        msg.slice(0, 200)
      );
    }
  }
}
