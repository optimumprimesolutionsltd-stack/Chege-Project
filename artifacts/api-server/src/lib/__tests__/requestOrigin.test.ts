/**
 * One service answers on both a custom domain and its generated hostname, and
 * sign-in has to work on whichever one the person actually loaded. Getting this
 * wrong is quiet: the app still serves pages, and only the OAuth round trip
 * lands somebody on the wrong host.
 *
 * The security case is the one worth having. A Host header is set by whoever
 * makes the request, so an unlisted host must never be echoed back into the
 * OAuth callback.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveOrigin } from "../requestOrigin.js";

const PRODUCTION = "https://jamvi.co.ke";
const PREVIEW = "https://jamvi.onrender.com";

let saved: NodeJS.ProcessEnv;
beforeEach(() => { saved = { ...process.env }; });
afterEach(() => { process.env = saved; });

/** Render terminates TLS and forwards the hostname the browser asked for. */
function arrivingAt(host: string) {
  return { "x-forwarded-proto": "https", "x-forwarded-host": host.replace(/^https:\/\//, "") };
}

describe("resolveOrigin", () => {
  it("pins to APP_ORIGIN when nothing else is allowed", () => {
    process.env.APP_ORIGIN = PRODUCTION;
    delete process.env.ADDITIONAL_ORIGINS;
    expect(resolveOrigin(arrivingAt(PREVIEW))).toBe(PRODUCTION);
  });

  it("keeps the preview hostname when it is listed", () => {
    process.env.APP_ORIGIN = PRODUCTION;
    process.env.ADDITIONAL_ORIGINS = PREVIEW;
    expect(resolveOrigin(arrivingAt(PREVIEW))).toBe(PREVIEW);
  });

  it("still serves the custom domain as itself", () => {
    process.env.APP_ORIGIN = PRODUCTION;
    process.env.ADDITIONAL_ORIGINS = PREVIEW;
    expect(resolveOrigin(arrivingAt(PRODUCTION))).toBe(PRODUCTION);
  });

  it("refuses a host nobody listed, rather than trusting the header", () => {
    // The attack: a forged Host header sends the OAuth callback, and the code
    // that comes with it, to a host the attacker controls.
    process.env.APP_ORIGIN = PRODUCTION;
    process.env.ADDITIONAL_ORIGINS = PREVIEW;
    expect(resolveOrigin(arrivingAt("https://evil.example.com"))).toBe(PRODUCTION);
  });

  it("is not fooled by an unlisted host appended to a listed one", () => {
    process.env.APP_ORIGIN = PRODUCTION;
    process.env.ADDITIONAL_ORIGINS = PREVIEW;
    expect(
      resolveOrigin({ "x-forwarded-proto": "https", "x-forwarded-host": "evil.example.com, jamvi.onrender.com" }),
    ).toBe(PRODUCTION);
  });

  it("accepts a list and tolerates spacing and trailing slashes", () => {
    process.env.APP_ORIGIN = PRODUCTION;
    process.env.ADDITIONAL_ORIGINS = ` ${PREVIEW}/ , https://staging.example.com `;
    expect(resolveOrigin(arrivingAt(PREVIEW))).toBe(PREVIEW);
    expect(resolveOrigin(arrivingAt("https://staging.example.com"))).toBe("https://staging.example.com");
  });

  it("falls back to the request when APP_ORIGIN is unset, as in development", () => {
    delete process.env.APP_ORIGIN;
    delete process.env.ADDITIONAL_ORIGINS;
    expect(resolveOrigin(arrivingAt(PREVIEW))).toBe(PREVIEW);
  });

  it("reads the plain Host header when there is no proxy in front", () => {
    delete process.env.APP_ORIGIN;
    delete process.env.ADDITIONAL_ORIGINS;
    expect(resolveOrigin({ host: "localhost:5173" })).toBe("https://localhost:5173");
  });
});
