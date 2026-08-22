// Transactional email via Resend, called directly with our own API key.
//
// This previously went through the Replit connector proxy, which held the
// credential on our behalf. That proxy only exists inside Replit, so every
// email the app sends - invitations included - silently failed anywhere else.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Thrown when RESEND_API_KEY is absent, so callers can report it as a
 *  configuration problem rather than a transient send failure. */
export class EmailNotConfiguredError extends Error {
  constructor(message = "RESEND_API_KEY must be set to send email.") {
    super(message);
    this.name = "EmailNotConfiguredError";
  }
}

/** Thrown when Resend rejects the request. Carries the status and body so
 *  callers can log the reason or decide whether a retry is worthwhile. */
export class EmailSendError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Resend API error (${status}): ${body}`);
    this.name = "EmailSendError";
  }
}

export interface OutgoingEmail {
  /** Display name and address, e.g. `Jamvi <info@example.co.ke>` */
  from: string;
  to: string[];
  subject: string;
  html: string;
}

export interface SentEmail {
  id?: string;
}

export async function sendEmail(email: OutgoingEmail): Promise<SentEmail> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new EmailNotConfiguredError();

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(email),
  });

  if (!response.ok) {
    throw new EmailSendError(response.status, await response.text());
  }

  return (await response.json()) as SentEmail;
}
