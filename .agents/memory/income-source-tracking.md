---
name: Income source tracking
description: How contributions are now calculated — from deposits + direct expense payments, not the contributions table
---

## The model

Contributions are now **derived**, not manually recorded:
- **Bank deposits** → always count as a contribution from the depositor (madeById)
- **Direct expense payments** → count as a contribution from the payer when `incomeSourceId IS NOT NULL`
- **Joint bank expenses** → incomeSourceId = NULL → do NOT count as contributions

“Financed by” belongs with the direct portion of an expense and applies only to that portion. A bank portion needs no income source: the account is already the complete record of where that money came from.

**Why:** Personal income-source tracing explains where directly paid money came from. Attaching it to a bank portion duplicates attribution and misrepresents money already recorded in the account.

**How to apply:** Per portion, not per expense. An expense may be funded from several portions — direct, bank, or a mix of both — and each direct portion carries its own income source while bank portions carry none. This corrects an earlier version of this note, which said direct and bank funding were mutually exclusive within one expense; that contradicted [[mixed-expense-funding-controls]] and the product intent, which is that one expense can be paid partly from a pocket and partly from a bank.

## DB changes

- New table: `income_sources` (id, userId, name, isMain, createdAt)
- `expenses.incomeSourceId` (nullable integer) — set when expense is paid from personal income
- `joint_account_transactions.incomeSourceId` (nullable integer) — which income source funded a deposit

## Seeding

`artifacts/api-server/src/routes/income-sources.ts` auto-seeds on first request if table is empty:
- Chege: Ujenzi Salary (main), Rental Income, Optimum
- Lydiah: EISH (main)

## Dashboard contributions query

`artifacts/api-server/src/routes/dashboard.ts` now calculates:
1. `directPayments` = SUM **all** expenses, grouped by paidById (incomeSourceId is optional metadata only — does NOT gate contribution counting)
2. `depositContribs` = SUM joint_account_transactions WHERE type='deposit', grouped by madeById
3. Merge into contribMap by userId

**Why:** All expenses represent personal money spent on the household. incomeSourceId is purely for categorisation. The old `contributionsTable` still exists for history but no new rows are written.

## Removed

- `backfillDepositContributions()` from `artifacts/api-server/src/index.ts`
- Auto-contribution creation in `artifacts/api-server/src/routes/joint-account.ts` deposit handler
- "Record contribution" form from web and mobile contributions pages
- Dashboard IncomeForm now uses `useCreateDeposit` (not `useCreateContribution`)

## Frontend income source picker

Pattern used everywhere (web expenses, web bank, mobile add-expense, mobile bank):
1. `useQuery(['income-sources', userId], fetch /api/income-sources?userId=...)` — direct fetch, no generated hook
2. Show source buttons; "Joint bank account" = incomeSourceId null, personal source = incomeSourceId = src.id
3. Pass `...(incomeSourceId ? { incomeSourceId } : {})` in the mutation data with type cast `as Parameters<...>[0]['data']`

## Generated types

Added to `lib/api-client-react/src/generated/api.schemas.ts`:
- `IncomeSource` interface (id, userId, name, isMain, createdAt)
- `incomeSourceId?: number` on `DepositInput`

**Why:** Manual edit avoids running orval which has complex config. Run `tsc --build` on the api-client-react package after schema edits to update dist declaration files.

## API client dist rebuild

After editing `api.schemas.ts`, run:
```
pnpm --filter @workspace/api-client-react exec tsc --build
```
Without this, consuming packages see stale dist/index.d.ts and miss new exports.

## Expected monthly income

Each income source has a non-negative monthly expected amount. The income-stream report compares that fixed source target with funding recorded in the selected month:

- **Expected** = the source's monthly target
- **Actual** = recorded personal funding for that source in the selected month
- **Remaining balance** = expected − actual (negative means the source is above target)

Sources with no activity still appear in the report so the group can see that their expected contribution has not yet been recorded. Unattributed funding is kept separate with an expected amount of zero.

**Why:** A group needs to see both the plan and the funds actually recorded, rather than an activity-only breakdown that hides missed income.

**How to apply:** Keep targets as recurring monthly source settings; do not treat them as a broader cash balance or a month-specific historical value without designing a separate target-history model.
