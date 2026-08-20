---
name: Bajeti SaaS roadmap
description: Durable product direction and sequencing for Bajeti as a shared-money SaaS.
---

Bajeti is chama-first. Its north star is helping chamas clearly understand what members contributed, where money went, what is available now, and whether shared goals or payouts are on track. Families, clubs, teams, and friends can use the same shared-money foundation, but chamas are the primary market and should guide prioritization.

**Why:** Shared financial products lose trust quickly when balances, reports, history, or releases are unreliable. The product should earn trust in the core money workflow before expanding its surface area.

**How to apply:** Sequence major work in this order, using chama workflows as the acceptance test:

1. **Release foundation:** keep one canonical mobile release target, make OTA updates dependable, add release-target checks, and provide a clear path for APK-required updates.
2. **Chama financial trust:** strengthen member contribution cycles, treasurer accountability, balance reconciliation, mismatch visibility, correction reasons, transaction rollback/concurrency safety, and report consistency.
3. **Daily chama collaboration:** complete activity feeds, income-source management, settings, goal history, completion states, member-facing explanations, contribution reminders, and clear records of group decisions or payouts.
4. **Group administration:** support multiple chamas, flexible roles such as members, treasurers, and auditors, invitations, permissions, audit visibility, and strict group-data separation. General family, club, team, and friend groups should fit without hardcoded family roles.
5. **Monetization:** offer a free group tier and paid group plans for advanced reports, exports, member capacity, reminders, and administration.
6. **Integrations and expansion:** add mobile money, bank, payment reminders, recurring contributions, scheduled reports, and messaging only after the core accounting and permissions model is trusted.

Normal JavaScript and design changes should use OTA; native Android changes require an APK release. Do not prioritize payments or integrations over financial correctness and release reliability.