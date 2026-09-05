/**
 * A small fixed-window rate limiter for the endpoints that are worth guessing
 * at: signing in, registering, and asking for a password reset.
 *
 * Deliberately dependency-free. The alternative was express-rate-limit, which
 * would mean a lockfile change, and Render builds with --frozen-lockfile. This
 * is about sixty lines and does the one thing needed.
 *
 * State lives in this process only. Jamvi runs a single instance, so that is
 * accurate today; if it is ever scaled out, each instance keeps its own counts
 * and the effective limit multiplies by the instance count. That degrades
 * gracefully - it is still a limit, just a looser one - but it is the reason to
 * move to a shared store rather than raising the numbers.
 *
 * Counting is by client IP, which in Kenya means counting by something many
 * unrelated people share: mobile subscribers sit behind carrier-grade NAT, so
 * a whole neighbourhood on Safaricom data can present as one address. Every
 * limit here is therefore set generously, and the sign-in limiter counts only
 * failed attempts, so that people successfully using the app never accumulate
 * against a neighbour who is fumbling their password.
 */

import type { NextFunction, Request, Response } from "express";

export interface RateLimitOptions {
  /** Length of the window in milliseconds. */
  windowMs: number;
  /** Attempts allowed per key per window. */
  max: number;
  /** Namespace for the counters, so two limiters never share a bucket. */
  name: string;
  /** Shown to the caller on refusal. */
  message: string;
  /**
   * Which responses count against the limit. Omitted means every request
   * counts, which is what an endpoint that always answers 200 needs. Supplying
   * it - typically `(status) => status >= 400` - counts only failures, so a
   * person who signs in correctly never uses up anyone's allowance.
   */
  countsAgainstLimit?: (statusCode: number) => boolean;
  /**
   * What to count by. Defaults to the client IP. A limiter can key on
   * something from the body instead, to cap what one target can be sent.
   */
  keyFor?: (req: Request) => string | null;
}

interface Counter {
  count: number;
  resetAt: number;
}

const counters = new Map<string, Counter>();

/** Bound the map. Sweeping on a size threshold rather than on a timer keeps
 *  this free when the server is idle and cheap when it is not. */
const SWEEP_THRESHOLD = 5_000;

function sweep(now: number): void {
  for (const [key, counter] of counters) {
    if (counter.resetAt <= now) counters.delete(key);
  }
}

/** Exposed for tests: counters are process-global and would otherwise leak
 *  between cases. */
export function resetRateLimits(): void {
  counters.clear();
}

export function clientIp(req: Request): string {
  // req.ip is only trustworthy because app.ts sets "trust proxy" to one hop,
  // which makes Express read the address Render's proxy appended rather than
  // anything the caller put in X-Forwarded-For themselves.
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

export function rateLimit(options: RateLimitOptions) {
  const { windowMs, max, name, message, countsAgainstLimit, keyFor } = options;

  return function rateLimiter(req: Request, res: Response, next: NextFunction): void {
    const subject = keyFor ? keyFor(req) : clientIp(req);
    // A limiter with nothing to count by lets the request through rather than
    // refusing everyone: the endpoint's own validation is the right place to
    // reject a request with no usable body.
    if (!subject) {
      next();
      return;
    }

    const key = `${name}:${subject}`;
    const now = Date.now();

    if (counters.size > SWEEP_THRESHOLD) sweep(now);

    const existing = counters.get(key);
    const counter = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

    if (counter.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((counter.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      req.log?.warn({ limiter: name }, "Rate limit reached");
      res.status(429).json({ error: message });
      return;
    }

    if (countsAgainstLimit) {
      // Decided once the response is written, so only the outcomes that matter
      // are counted.
      res.on("finish", () => {
        if (!countsAgainstLimit(res.statusCode)) return;
        const current = counters.get(key);
        const target = current && current.resetAt > now
          ? current
          : { count: 0, resetAt: now + windowMs };
        target.count += 1;
        counters.set(key, target);
      });
    } else {
      counter.count += 1;
      counters.set(key, counter);
    }

    next();
  };
}

const failed = (statusCode: number) => statusCode >= 400;

/** Wrong passwords, per address. Counts only failures, so ordinary use costs
 *  nothing even when many people share one carrier IP. */
export const signInLimiter = rateLimit({
  name: "sign-in",
  windowMs: 15 * 60 * 1000,
  max: 20,
  countsAgainstLimit: failed,
  message: "Too many sign-in attempts from this connection. Wait a few minutes and try again.",
});

/** New accounts, per address. Every request counts: a successful registration
 *  is exactly what is being limited. */
export const registerLimiter = rateLimit({
  name: "register",
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many accounts created from this connection. Try again later.",
});

/** Reset requests, per address. This endpoint answers 200 whatever happens, so
 *  there is no failure to count - every request counts. */
export const forgotPasswordLimiter = rateLimit({
  name: "forgot-password",
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: "Too many reset requests from this connection. Try again later.",
});

/**
 * Reset requests, per email address.
 *
 * Stops one inbox being flooded from many connections, which the per-IP limit
 * above cannot see. Three an hour is above what anyone asking in earnest
 * needs, and low enough that the mailbox stays usable. It leaks nothing: the
 * endpoint's answer is identical whether or not the address has an account,
 * and a refusal here is about this address having been asked for recently, not
 * about whether it exists.
 */
export const forgotPasswordEmailLimiter = rateLimit({
  name: "forgot-password-email",
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "A reset link for that address was requested recently. Check your inbox, including spam.",
  keyFor: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" && email.trim() ? email.trim().toLocaleLowerCase("en-US") : null;
  },
});

/** Spending a reset link. Guessing a 64-character token is not realistic, so
 *  this is a backstop rather than the defence. */
export const resetPasswordLimiter = rateLimit({
  name: "reset-password",
  windowMs: 60 * 60 * 1000,
  max: 20,
  countsAgainstLimit: failed,
  message: "Too many attempts. Ask for a new reset link.",
});
