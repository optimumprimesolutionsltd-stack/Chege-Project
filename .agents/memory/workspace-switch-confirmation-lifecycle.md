---
name: Workspace switch confirmation lifecycle
description: Prevent mobile navigation shells from unmounting a locally owned workspace-switch confirmation.
---

Keep the workspace switcher mounted until its confirmation succeeds or is cancelled. If a mobile drawer owns the switcher, do not close the drawer as soon as an option is selected.

**Why:** Closing the drawer immediately unmounts the switcher and its locally owned confirmation dialog, making the dropdown appear selectable while silently preventing the budget change.

**How to apply:** Let selection open the confirmation while the shell remains mounted. Close the shell only after the switch mutation succeeds, immediately before the workspace reload.