import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";

export interface WebBuildServingOptions {
  enabled?: boolean;
  /**
   * Legacy single-build option. When supplied, this retains the former
   * root-mounted SPA behavior for callers and tests that only have one build.
   */
  buildDir?: string;
  marketingBuildDir?: string;
  appBuildDir?: string;
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
    : defaultAppBuildDir();
}

export function defaultAppBuildDir(): string {
  return path.resolve(
    apiServerPackageDir(),
    "..",
    "family-budget",
    "dist",
    "public",
  );
}

export function defaultMarketingBuildDir(): string {
  return path.resolve(
    apiServerPackageDir(),
    "..",
    "jamvi-website",
    "dist",
    "public",
  );
}

function requireIndexFile(buildDir: string, packageName: string): string {
  const indexFile = path.join(buildDir, "index.html");

  if (!existsSync(indexFile)) {
    throw new Error(
      `SERVE_WEB is enabled, but the web build was not found at "${indexFile}". ` +
        `Build ${packageName} before starting the API server.`,
    );
  }

  return indexFile;
}

function isApiRequest(requestPath: string): boolean {
  return requestPath === "/api" || requestPath.startsWith("/api/");
}

function attachSingleWebBuild(app: Express, buildDir: string): void {
  const indexFile = requireIndexFile(buildDir, "@workspace/family-budget");

  app.use(
    express.static(buildDir, {
      index: false,
      maxAge: "1y",
      immutable: true,
    }),
  );

  app.get("/{*splat}", (req, res, next) => {
    if (isApiRequest(req.path) || !req.accepts("html")) {
      next();
      return;
    }

    res.sendFile(indexFile);
  });
}

function attachDualWebBuilds(
  app: Express,
  marketingBuildDir: string,
  appBuildDir: string,
): void {
  const marketingIndexFile = requireIndexFile(
    marketingBuildDir,
    "@workspace/jamvi-website",
  );
  const appIndexFile = requireIndexFile(
    appBuildDir,
    "@workspace/family-budget",
  );

  // Register the scoped application first so its /app assets cannot be
  // shadowed by a similarly named marketing asset.
  // People type the address they know from every other site. None of these are
  // routes in the marketing app, so without this they fall through to its
  // catch-all and land on the not-found page — a soft 404 that answers 200 and
  // looks like the site is broken. Sending them to /app/ lets the app decide:
  // straight to the dashboard if their session is good, to sign-in if not.
  const SIGN_IN_ALIASES = [
    "/login",
    "/log-in",
    "/signin",
    "/sign-in",
    "/signup",
    "/sign-up",
    "/register",
  ];
  for (const alias of SIGN_IN_ALIASES) {
    app.get(alias, (_req, res) => {
      res.redirect(302, "/app/");
    });
  }

  // Invitation and group-join links carry a token in the path. They were sent
  // without the /app prefix for a long time, and every one of those is still
  // sitting in somebody's inbox. Unprefixed they hit the marketing catch-all
  // below and answer 200 with its shell, so the recipient sees a page that is
  // not an error and not their invitation. These forward the whole path, since
  // a redirect to /app/ alone would drop the token and lose the invitation.
  const TOKEN_PATH_ALIASES = ["/invite", "/join"];
  for (const alias of TOKEN_PATH_ALIASES) {
    app.get(`${alias}/{*splat}`, (req, res) => {
      res.redirect(302, `/app${req.originalUrl}`);
    });
  }

  // Express does not distinguish "/app" from "/app/" by default, so this route
  // matches both. Redirecting "/app/" to "/app/" is an infinite loop, and the
  // browser gives up with ERR_TOO_MANY_REDIRECTS — the app is unreachable at
  // its own front door while every deeper path still works, which is what makes
  // it easy to miss.
  app.get("/app", (req, res, next) => {
    if (req.path.endsWith("/")) {
      next();
      return;
    }
    res.redirect(308, "/app/");
  });
  app.use(
    "/app",
    express.static(appBuildDir, {
      index: false,
      maxAge: "1y",
      immutable: true,
    }),
  );
  app.get("/app/{*splat}", (req, res, next) => {
    if (!req.accepts("html")) {
      next();
      return;
    }

    res.sendFile(appIndexFile);
  });

  app.use(
    express.static(marketingBuildDir, {
      // The marketing build is prerendered: every public route is written as a
      // directory with its own index.html carrying that page's title,
      // description, and canonical URL. `index: false` made all of them
      // unreachable — a request for /faq/ fell through to the catch-all below
      // and was answered with the root index, so each page claimed to be the
      // home page. Serving them is the entire reason they are generated.
      index: "index.html",
      maxAge: "1y",
      immutable: true,
      setHeaders(res, filePath) {
        // Assets carry a content hash and can be cached forever. HTML cannot:
        // it is the file that names the current asset hashes, so caching it
        // immutably for a year leaves a returning visitor pinned to whatever
        // was deployed the day they first arrived.
        if (filePath.endsWith(".html")) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }),
  );
  // Anything with no prerendered file is a client-side route, so the shell
  // answers and the router decides — including the 404 page.
  app.get("/{*splat}", (req, res, next) => {
    if (isApiRequest(req.path) || !req.accepts("html")) {
      next();
      return;
    }

    res.sendFile(marketingIndexFile);
  });
}

/**
 * Mount built marketing and authenticated application SPAs on the API process
 * for same-origin external hosting. The API namespace remains untouched for
 * the router mounted after this handler.
 */
export function attachWebBuild(
  app: Express,
  options: WebBuildServingOptions = {},
): void {
  const enabled = options.enabled ?? process.env.SERVE_WEB === "true";
  if (!enabled) return;

  if (options.buildDir) {
    attachSingleWebBuild(app, path.resolve(options.buildDir));
    return;
  }

  const marketingBuildDir = options.marketingBuildDir
    ? path.resolve(options.marketingBuildDir)
    : defaultMarketingBuildDir();
  const appBuildDir = options.appBuildDir
    ? path.resolve(options.appBuildDir)
    : defaultBuildDir();

  attachDualWebBuilds(app, marketingBuildDir, appBuildDir);
}
