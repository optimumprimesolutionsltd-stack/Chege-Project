import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";

export interface WebBuildServingOptions {
  enabled?: boolean;
  buildDir?: string;
}

function apiServerPackageDir(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const manifestPath = path.join(directory, "package.json");

    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          name?: string;
        };

        if (manifest.name === "@workspace/api-server") {
          return directory;
        }
      } catch {
        // Keep searching so an unrelated or malformed parent manifest does not
        // make the deployment path depend on the current working directory.
      }
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error(
        "Unable to locate the @workspace/api-server package directory.",
      );
    }
    directory = parent;
  }
}

export function defaultBuildDir(): string {
  const configured = process.env.WEB_DIST_DIR?.trim();
  return configured
    ? path.resolve(configured)
    : path.resolve(
        apiServerPackageDir(),
        "..",
        "family-budget",
        "dist",
        "public",
      );
}

/**
 * Mount the built Vite application on the API process for external hosting.
 * API routes are intentionally left to the router mounted after this handler.
 */
export function attachWebBuild(
  app: Express,
  options: WebBuildServingOptions = {},
): void {
  const enabled = options.enabled ?? process.env.SERVE_WEB === "true";
  if (!enabled) return;

  const buildDir = options.buildDir
    ? path.resolve(options.buildDir)
    : defaultBuildDir();
  const indexFile = path.join(buildDir, "index.html");

  if (!existsSync(indexFile)) {
    throw new Error(
      `SERVE_WEB is enabled, but the web build was not found at "${indexFile}". ` +
        "Build @workspace/family-budget before starting the API server.",
    );
  }

  // Static files are deliberately served before session lookup. Assets do not
  // need a database-backed session refresh, and /api remains below the auth
  // middleware as the only protected namespace.
  app.use(
    express.static(buildDir, {
      index: false,
      maxAge: "1y",
      immutable: true,
    }),
  );

  app.get("/{*splat}", (req, res, next) => {
    if (
      req.path === "/api" ||
      req.path.startsWith("/api/") ||
      !req.accepts("html")
    ) {
      next();
      return;
    }

    res.sendFile(indexFile);
  });
}
