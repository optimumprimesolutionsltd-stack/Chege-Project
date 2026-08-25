---
name: Member money-record corrections
description: Authorization rule for shared-budget financial records, including same-day member corrections and manager-only removals.
---

In a shared budget, owners and admins may edit or remove financial records. Regular members may correct only a personal record attributed to them and dated today in the Africa/Nairobi business timezone. They cannot remove money records, edit shared/split/Joint-bank activity, or change historical records.

**Why:** Group money needs a clear audit trail while still letting a member promptly correct their own typo.

**How to apply:** Enforce this on the server for every financial mutation; make the UI show Edit only on eligible same-day personal records, keep their date locked, and explain when an admin must make the correction.