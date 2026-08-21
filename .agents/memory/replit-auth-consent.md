---
name: Replit Auth consent prompt
description: Consent behavior for Bajeti's managed Replit OIDC login.
---

Do not force an OIDC `prompt` value on Bajeti's web or mobile authorization requests.

**Why:** Requiring `login consent` makes returning users repeat the provider's authorization step. Omitting it lets the provider reuse an existing trusted session and grant while retaining its own first-time authorization policy.

**How to apply:** Keep the authorization-code, PKCE, state, nonce, requested scopes, and callback validation unchanged. A first-time user or a user whose provider state requires reauthorization can still see a provider-managed screen; that behavior cannot be customized while using Replit Auth.