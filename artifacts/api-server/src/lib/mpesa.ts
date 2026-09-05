/**
 * Safaricom Daraja — Lipa Na M-Pesa Online (STK Push).
 *
 * STK Push is a one-off prompt: the member's phone buzzes, they enter their
 * PIN, the money moves. It cannot deduct on a schedule. Recurring collection
 * is M-Pesa Ratiba, a separate Safaricom product, so monthly renewal here is
 * a reminder and one tap rather than a silent deduction.
 *
 * Nothing in this file trusts what comes back from Safaricom. A callback
 * arrives on a public URL with no signature, so the only thing that makes it
 * credible is that it quotes a checkoutRequestId we issued.
 */

const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";
const PRODUCTION_BASE = "https://api.safaricom.co.ke";

export interface MpesaConfig {
  consumerKey: string;
  consumerSecret: string;
  shortcode: string;
  passkey: string;
  callbackUrl: string;
  baseUrl: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`M-Pesa is not configured: set ${name}.`);
  }
  return value;
}

/**
 * Sandbox unless MPESA_ENV says production, so a missing variable can only
 * ever cost a test payment rather than a real one.
 */
export function mpesaConfig(): MpesaConfig {
  const production = process.env.MPESA_ENV?.trim().toLowerCase() === "production";
  return {
    consumerKey: required("MPESA_CONSUMER_KEY"),
    consumerSecret: required("MPESA_CONSUMER_SECRET"),
    shortcode: required("MPESA_SHORTCODE"),
    passkey: required("MPESA_PASSKEY"),
    callbackUrl: required("MPESA_CALLBACK_URL"),
    baseUrl: production ? PRODUCTION_BASE : SANDBOX_BASE,
  };
}

export function isMpesaConfigured(): boolean {
  try {
    mpesaConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Safaricom's own timestamp format, in Nairobi time.
 *
 * It is part of the password hash, so a server running in UTC — which Render
 * does — must not hand it a UTC clock or every request is rejected as
 * malformed.
 */
export function darajaTimestamp(now: Date = new Date()): string {
  const nairobi = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    nairobi.getUTCFullYear(),
    pad(nairobi.getUTCMonth() + 1),
    pad(nairobi.getUTCDate()),
    pad(nairobi.getUTCHours()),
    pad(nairobi.getUTCMinutes()),
    pad(nairobi.getUTCSeconds()),
  ].join("");
}

/**
 * Normalises a Kenyan number to the 2547XXXXXXXX / 2541XXXXXXXX form Daraja
 * insists on. People type all of these, and a wrong shape is rejected with an
 * error that does not say which field was wrong.
 */
export function normalizeMsisdn(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  throw new Error("Enter a Safaricom number such as 07XX XXX XXX.");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Daraja tokens last an hour. Re-fetched a minute early so a request cannot
 *  be sent with a token that expires mid-flight. */
export async function accessToken(config: MpesaConfig = mpesaConfig()): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const credentials = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const response = await fetch(
    `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${credentials}` } },
  );
  if (!response.ok) {
    throw new Error(`Could not authenticate with M-Pesa (${response.status}).`);
  }
  const body = await response.json() as { access_token?: string; expires_in?: string };
  if (!body.access_token) throw new Error("M-Pesa returned no access token.");

  const lifetimeSeconds = Number(body.expires_in ?? 3599);
  cachedToken = {
    value: body.access_token,
    expiresAt: now + Math.max(0, lifetimeSeconds - 60) * 1000,
  };
  return cachedToken.value;
}

/** Only for tests, which must not inherit a token cached by another case. */
export function resetTokenCache(): void {
  cachedToken = null;
}

export interface StkPushResult {
  merchantRequestId: string;
  checkoutRequestId: string;
  customerMessage: string;
}

/**
 * Sends the prompt. Returning successfully means Safaricom accepted the
 * request, not that anybody paid — the answer arrives later on the callback,
 * or never, if the member ignores their phone.
 */
export async function sendStkPush(params: {
  phoneNumber: string;
  amountKes: number;
  accountReference: string;
  description: string;
  config?: MpesaConfig;
}): Promise<StkPushResult> {
  const config = params.config ?? mpesaConfig();
  const timestamp = darajaTimestamp();
  const password = Buffer
    .from(`${config.shortcode}${config.passkey}${timestamp}`)
    .toString("base64");

  const response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(config)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: params.amountKes,
      PartyA: params.phoneNumber,
      PartyB: config.shortcode,
      PhoneNumber: params.phoneNumber,
      CallBackURL: config.callbackUrl,
      AccountReference: params.accountReference,
      TransactionDesc: params.description,
    }),
  });

  const body = await response.json() as {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    CustomerMessage?: string;
    errorMessage?: string;
    ResponseCode?: string;
  };

  if (!response.ok || !body.CheckoutRequestID) {
    // Daraja's own wording is more useful to support than anything generic,
    // and it never contains the member's PIN or any credential.
    throw new Error(body.errorMessage ?? `M-Pesa refused the request (${response.status}).`);
  }

  return {
    merchantRequestId: body.MerchantRequestID ?? "",
    checkoutRequestId: body.CheckoutRequestID,
    customerMessage: body.CustomerMessage ?? "Check your phone to complete payment.",
  };
}

export interface StkQueryResult {
  resultCode: number;
  resultDesc: string;
}

/**
 * Asks Safaricom what became of a prompt.
 *
 * The reason this exists: an ignored prompt produces no callback at all, so
 * without asking, those payments sit pending forever and the member is never
 * told anything.
 */
export async function queryStkStatus(
  checkoutRequestId: string,
  config: MpesaConfig = mpesaConfig(),
): Promise<StkQueryResult> {
  const timestamp = darajaTimestamp();
  const password = Buffer
    .from(`${config.shortcode}${config.passkey}${timestamp}`)
    .toString("base64");

  const response = await fetch(`${config.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken(config)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  const body = await response.json() as { ResultCode?: string; ResultDesc?: string };
  return {
    resultCode: Number(body.ResultCode ?? -1),
    resultDesc: body.ResultDesc ?? "No result reported.",
  };
}

export interface CallbackFacts {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: number;
  resultDesc: string;
  mpesaReceiptNumber: string | null;
  amountKes: number | null;
  phoneNumber: string | null;
}

/**
 * Pulls the facts out of a callback body without trusting any of them.
 *
 * The payload is attacker-controllable: the endpoint is public and Safaricom
 * signs nothing. So this only reads, and returns null for anything it cannot
 * make sense of. Whether the callback means anything is decided by matching
 * its checkoutRequestId to a payment we already created.
 */
export function readCallback(payload: unknown): CallbackFacts | null {
  const stk = (payload as { Body?: { stkCallback?: Record<string, unknown> } })
    ?.Body?.stkCallback;
  if (!stk || typeof stk !== "object") return null;

  const checkoutRequestId = stk.CheckoutRequestID;
  if (typeof checkoutRequestId !== "string" || !checkoutRequestId) return null;

  const items = (stk.CallbackMetadata as { Item?: unknown })?.Item;
  const metadata = new Map<string, unknown>();
  if (Array.isArray(items)) {
    for (const item of items) {
      const entry = item as { Name?: unknown; Value?: unknown };
      if (typeof entry?.Name === "string") metadata.set(entry.Name, entry.Value);
    }
  }

  const receipt = metadata.get("MpesaReceiptNumber");
  const amount = Number(metadata.get("Amount"));
  const phone = metadata.get("PhoneNumber");

  return {
    checkoutRequestId,
    merchantRequestId: typeof stk.MerchantRequestID === "string" ? stk.MerchantRequestID : "",
    resultCode: Number(stk.ResultCode ?? -1),
    resultDesc: typeof stk.ResultDesc === "string" ? stk.ResultDesc : "",
    mpesaReceiptNumber: typeof receipt === "string" ? receipt : null,
    amountKes: Number.isFinite(amount) ? amount : null,
    phoneNumber: phone === undefined || phone === null ? null : String(phone),
  };
}
