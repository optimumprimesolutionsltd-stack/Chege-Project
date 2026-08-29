# Platform Parity Checklist

This file tracks which features and screens exist on the **web app** (`artifacts/family-budget`) and the **mobile app** (`artifacts/mobile-budget`). It is the source of truth for feature drift between the two platforms.

## How to keep this updated

Whenever you add, change, or remove a feature on either platform, find the relevant row in the table below and update its status column and gap note. If you add an entirely new screen or feature area that isn't listed, append a new row. Use the status legend below. The `/parity` route in the web app renders this same data from a constant in `artifacts/family-budget/src/pages/parity.tsx` (`PARITY_ITEMS`) — update that constant in the same commit.

**Status legend**
| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented |
| ⏳ | Partially implemented / in progress |
| ❌ | Not yet implemented |

---

## Screens & Features

| Feature / Screen | Web | Mobile | Gap / Notes |
|---|:---:|:---:|---|
| **Core screens** | | | |
| Dashboard / Home | ✅ | ✅ | Web: charts & quick-action forms. Mobile: summary cards, bank balance, activity preview |
| Budget chooser before Home | ✅ | ✅ | First authenticated entry lets users choose Personal or a member Shared budget before financial details load; returning users can continue directly |
| Monthly budget overview | ✅ | ✅ | Web: pie chart + category cards. Mobile: budget tab with category cards |
| Full activity feed screen | ✅ | ❌ | Web activity links each editable source to its ledger and lets managers remove eligible expenses/deposits; mobile shows a 5-item dashboard preview and its full feed is pending |
| Settings screen | ✅ | ✅ | Both platforms manage account and budget workspace settings |
| Platform parity page | ✅ | ❌ | This page is web-only |
| **Expenses** | | | |
| Expense list | ✅ | ✅ | Mobile: hidden "History" tab reachable from dashboard |
| Log an expense | ✅ | ✅ | Both use one primary funding amount and automatically assign any remainder to the explicitly selected second income source or bank account |
| Edit an expense (incl. payer correction) | ✅ | ✅ | Both show a visible Edit action and a prefilled form for all fields, including payer |
| Delete an expense | ✅ | ✅ | Both show a visible Remove action with a destructive confirmation |
| Recurring expense flag | ✅ | ✅ | Both allow marking an expense as recurring |
| Apply prior-month recurring expenses | ✅ | ❌ | Mobile apply-from-prior-month is a pending task |
| Calendar date picker on expenses | ✅ | ❌ | Mobile uses arrow controls (prev/next day); calendar picker is a pending task |
| **Budget** | | | |
| Category budget viewing | ✅ | ✅ | Both show spend vs. budget per category |
| Budget identity personalization | ✅ | ✅ | Both support Unicode names, optional emoji, curated name styles, meaningful category icons, and theme-aware surfaces |
| Edit or remove category limits | ✅ | ✅ | Both show visible Edit and Remove actions; manager permissions still apply in Shared budgets |
| Balance mismatch alert | ⏳ | ❌ | Web surface is a pending task |
| **Contributions** | | | |
| Record a deposit / contribution | ✅ | ✅ | Both support recording monthly contributions per person |
| Edit or remove contribution records | ✅ | ✅ | Both have a month-scoped management list. Owners/admins manage all; members can edit only their own current-day record and cannot remove |
| Contributor summary | ✅ | ✅ | Both show per-person contributed/target/spent/net |
| Month navigation (prev/next) | ✅ | ✅ | Both support browsing past months |
| Month-jump picker | ✅ | ✅ | Both have a 24-month jump picker (web: contributions; mobile: contributions + history) |
| **Savings goals** | | | |
| Savings goals list (active & completed) | ✅ | ✅ | Both show active and completed goals |
| Create a savings goal | ✅ | ✅ | Both support goal creation with name, target, and optional deadline |
| Goal deadline | ✅ | ✅ | Both include a deadline picker on create/edit |
| Edit a goal (name / target / deadline) | ✅ | ✅ | Both support editing; mobile also renames completed goals |
| Delete a goal | ✅ | ✅ | Both expose visible management actions and require confirmation before removal |
| Contribute to a single goal | ✅ | ✅ | Both support per-goal contributions |
| Cascade / waterfall contribution | ✅ | ❌ | Web distributes across all goals in priority order; mobile is single-goal only |
| Goal completion badge | ✅ | ✅ | Web: badge on goal card. Mobile: "Goal reached!" label; completed goals omit contribute button |
| Goal history with date filters | ✅ | ✅ | Both show per-goal contribution history with month/range filters |
| Remove a savings contribution or correction | ✅ | ✅ | Owners/admins can remove an entry from goal history with confirmation; the goal balance is recalculated |
| Display correction reason in history | ⏳ | ⏳ | Reason is captured on both platforms but not yet shown in history — pending task |
| Balance correction (edit current amount) | ✅ | ✅ | Both allow correcting current amount; large corrections (>50%) require a reason |
| **Bank** | | | |
| Bank account balance display | ✅ | ✅ | Both show current balance; mobile shows it on dashboard card and bank tab |
| Bank transactions list | ✅ | ✅ | Both show deposit/disbursement transaction history |
| Record a bank deposit | ✅ | ✅ | Both support recording deposits (with optional member/description) |
| Record a disbursement | ✅ | ✅ | Both support recording disbursements |
| Delete a bank transaction | ✅ | ❌ | Web-only; mobile bank screen has no delete action — pending task |
| Date selection on bank transactions | ✅ | ❌ | Mobile always uses today's date — pending task |
| **Members & auth** | | | |
| Authentication (sign-in) | ✅ | ✅ | Both use Replit Auth / deep-link token flow |
| Batch email invitations | ✅ | ✅ | Managers can paste multiple email addresses and invite everyone in one batch with per-address results |
| Add / remove partner | ✅ | ❌ | Settings page on web; no equivalent on mobile |
| Dark mode | ✅ | ✅ | Both respect the system theme |
