import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { attachWebBuild } from "./lib/webAppServing";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Browsers only send Origin on cross-origin requests. The web app is served
// same-origin with /api (Replit's application router in development, a rewrite
// in production) and React Native sends no Origin at all, so this allowlist
// affects neither today. It exists so that when the app and API are split
// across hostnames, a third-party page still cannot make credentialed calls.
const allowedOrigins = (
  process.env.CORS_ORIGINS ??
  process.env.APP_ORIGIN ??
  ""
)
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (process.env.NODE_ENV !== "production") {
  for (const domain of [
    process.env.REPLIT_DEV_DOMAIN,
    process.env.REPLIT_INTERNAL_APP_DOMAIN,
  ]) {
    if (domain) {
      allowedOrigins.push(`https://${domain.replace(/^https?:\/\//, "")}`);
    }
  }
}

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // Absent Origin means same-origin, a native mobile client, or a
      // server-to-server call - none of which CORS is meant to police.
      if (!origin) return callback(null, true);

      const requested = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(requested)) return callback(null, true);

      if (
        process.env.NODE_ENV !== "production" &&
        /^https?:\/\/localhost(:\d+)?$/.test(requested)
      ) {
        return callback(null, true);
      }

      // Refuse by omitting the CORS headers rather than raising, so the caller
      // gets a clean browser-level block instead of a 500 from this server.
      logger.warn({ origin }, "Blocked cross-origin request");
      return callback(null, false);
    },
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
attachWebBuild(app);
app.use(authMiddleware);

app.use("/api", router);

export default app;
