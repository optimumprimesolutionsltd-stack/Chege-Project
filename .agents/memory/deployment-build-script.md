---
name: Mobile deployment build script entry point
description: How scripts/build.js constructs the Metro bundle URL, and what breaks if the package.json main field changes.
---

## Rule
`artifacts/mobile-budget/scripts/build.js` `downloadBundle()` must use an entry path that matches `package.json "main"`.

The bundle URL is built as:
```js
const entryPath = path.resolve(projectRoot, 'expo-entry'); // no extension
const bundlePath = path.relative(workspaceRoot, entryPath);
// → artifacts/mobile-budget/expo-entry
const url = `http://localhost:8081/${bundlePath}.bundle`;
// → http://localhost:8081/artifacts/mobile-budget/expo-entry.bundle
```

**Why:** Metro serves bundles at `<relative-entry-path>.bundle`. If `main` is `./expo-entry.js`, Metro serves `expo-entry.bundle` (extension resolved internally). The old hardcoded path `node_modules/expo-router/entry` produced a 404 once main changed, breaking the deployment build with `Download failed: HTTP 404`.

**How to apply:** Any time `package.json "main"` is changed in the mobile artifact, update the `entryPath` in `downloadBundle()` to match (without the `.js` extension).
