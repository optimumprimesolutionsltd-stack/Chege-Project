---
name: Email invitation public origin
description: Canonical URL and security rule for links sent in Jamvi group invitation emails.
---

Email invitation links require `APP_URL` to be set to Jamvi’s canonical public HTTPS origin. Never derive an emailed invitation URL from `Host` or forwarded request headers.

**Why:** Invitation links are bearer capabilities. A manipulated host header could otherwise cause a valid token to be sent to an attacker-controlled domain.

**How to apply:** Keep `APP_URL` configured in the shared environment for the public Jamvi app. If it is absent or not a clean HTTPS URL, email invitation delivery must fail explicitly rather than guessing an origin.