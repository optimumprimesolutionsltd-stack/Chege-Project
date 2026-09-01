---
name: Managed OpenAI response compatibility
description: Compatibility rules for server features using Replit's managed OpenAI proxy.
---

Treat the managed OpenAI URL as the SDK base: append the operation path directly instead of inserting a hardcoded `/v1`. Preserve separate routing for legacy or custom OpenAI-compatible URLs. Current GPT-5 models also need enough completion allowance for reasoning, and successful text may arrive as structured content parts rather than one string.

**Why:** A low completion allowance produced successful but empty responses, and assuming a conventional `/v1/chat/completions` path caused the managed proxy to reject an otherwise valid request.

**How to apply:** For server-side Jamvi AI features, use the managed base URL exactly as provisioned, keep completion limits compatible with the selected current model, and normalize both string and structured text output before treating a response as empty.