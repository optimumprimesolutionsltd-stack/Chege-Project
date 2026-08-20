---
name: Bajeti SaaS roadmap
description: Durable product direction and sequencing for Bajeti as a shared-money SaaS.
---

Bajeti's north star is helping families, chamas, clubs, teams, and friends clearly understand what money came in, where it went, what is available now, and whether shared goals are on track.

**Why:** Shared financial products lose trust quickly when balances, reports, history, or releases are unreliable. The product should earn trust in the core money workflow before expanding its surface area.

**How to apply:** Sequence major work in this order:

1. **Release foundation:** keep one canonical mobile release target, make OTA updates dependable, add release-target checks, and provide a clear path for APK-required updates.
2. **Financial trust:** strengthen balance reconciliation, mismatch visibility, correction reasons, transaction rollback/concurrency safety, and report consistency.
3. **Daily collaboration:** complete activity feeds, income-source management, settings, goal history, completion states, and member-facing explanations.
4. **Group administration:** support multiple groups, flexible roles, invitations, permissions, audit visibility, and strict group-data separation.
5. **Monetization:** offer a free group tier and paid group plans for advanced reports, exports, member capacity, reminders, and administration.
6. **Integrations and expansion:** add mobile money, bank, payment reminders, recurring contributions, scheduled reports, and messaging only after the core accounting and permissions model is trusted.

Normal JavaScript and design changes should use OTA; native Android changes require an APK release. Do not prioritize payments or integrations over financial correctness and release reliability.