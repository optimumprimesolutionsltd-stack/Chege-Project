import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Render gates deploys on this path: the previous instance keeps serving until
// the new one answers here. It used to return a hardcoded "ok" without touching
// anything, so an instance that started cleanly but could not reach Postgres
// still reported healthy - and Render would cut live traffic over to it.
//
// The app is useless without its database, so the check now depends on one.
// The trade-off is deliberate: a deploy fails while the database is
// unreachable, rather than succeeding into a broken state.
const HEALTH_QUERY_TIMEOUT_MS = 5_000;

router.get("/healthz", async (_req, res) => {
  try {
    // A hung query would leave Render waiting for the whole health-check
    // window, so cap it. The query itself is left to finish on its connection.
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_resolve, reject) =>
        setTimeout(
          () => reject(new Error("Database health check timed out")),
          HEALTH_QUERY_TIMEOUT_MS,
        ),
      ),
    ]);

    res.json(HealthCheckResponse.parse({ status: "ok" }));
  } catch (error) {
    logger.error({ err: error }, "Health check could not reach the database");
    res
      .status(503)
      .json(HealthCheckResponse.parse({ status: "database unavailable" }));
  }
});

export default router;
