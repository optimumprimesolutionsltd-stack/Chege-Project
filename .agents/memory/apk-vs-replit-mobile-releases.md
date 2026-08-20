---
name: APK and Replit mobile releases
description: Distinguishes the OTA source for installed Android APKs from the Replit-hosted Expo artifact.
---

An installed Bajeti APK receives JavaScript updates only from the Expo project and update channel baked into that APK. Replit's mobile artifact build hosts a separate static Expo bundle for previews and Expo/browser clients; publishing it does not update installed APKs.

**Why:** A feature can be present in the Replit-published bundle while members' installed APKs legitimately remain on the previous bundle, creating a misleading apparent deployment failure.

**How to apply:** For an installed APK, release ordinary UI/JavaScript changes through the same Expo OTA project, channel, and runtime version that built the APK. Reserve Replit mobile publishing for preview/browser delivery. Do not change the Expo owner, project ID, or channel without confirming which account owns the currently updating APK.