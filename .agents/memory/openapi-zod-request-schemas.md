---
name: OpenAPI Zod request schemas
description: Avoiding naming collisions between generated TypeScript request types and Zod validation schemas.
---

Define each request body as a named OpenAPI component rather than an inline object.

**Why:** The Zod generator emits validation values based on the operation body name, while the TypeScript generator emits request types. An inline request body can give both exports the same name and break the shared API package build.

**How to apply:** When adding a mutating endpoint, create a descriptive input schema under `components.schemas` and reference it from `requestBody`. Regenerate both clients before compiling dependent apps.