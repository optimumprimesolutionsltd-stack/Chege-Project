---
name: Mobile web auth testing
description: Why authenticated Expo-web tests cannot complete with the native mobile authentication flow in this project.
---

## Rule
Do not treat Expo web as proof of authenticated mobile flows in this project; use it for render checks, then verify authenticated behavior in Expo Go or a native preview build.

**Why:** In this workspace, the browser preview can render the mobile app but cannot retain the authenticated session through the native-oriented login return. A web login can therefore stall even when the native path is correct.

**How to apply:** Use browser automation for the shared web app and unauthenticated mobile render checks. Use a native device or preview build for signed-in mobile bank, goals, and other protected screens.