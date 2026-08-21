---
name: Native workspace selection
description: How the Expo app preserves a selected group while the server keeps workspace authorization authoritative.
---

The mobile app may persist only the selected workspace identifier locally and sends it through the shared API client as a workspace preference. The server must verify that the authenticated user still belongs to that workspace on every request and fall back to their private My Budget workspace when it is stale or invalid.

**Why:** Expo bearer-token sessions do not have the browser's dependable HTTP-only cookie handling. Treating a locally stored selection as authorization would allow stale or tampered client state to select another group.

**How to apply:** Keep this transport behavior centralized in the shared API client. Any new mobile feature that depends on the active workspace should use the verified server response, never trust the locally persisted identifier as data access permission.