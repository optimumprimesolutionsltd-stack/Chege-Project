---
name: Metro port collisions
description: Why simultaneous Expo preview and static-build processes need distinct Metro ports in this Replit workspace.
---

## Rule
Run concurrent Expo/Metro processes on distinct ports instead of relying on Expo to choose an alternative interactively.

**Why:** Replit can keep several preview workflows running at once. A noninteractive Expo build exits when its requested port is already occupied, while an interactive terminal would normally ask to select another.

**How to apply:** Before starting an additional static mobile build, choose an unused Metro port through the build's supported environment override or stop the conflicting preview workflow.