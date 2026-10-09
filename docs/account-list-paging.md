# Loading an account's history a page at a time

Status: **step 1 done (5 Oct 2026). Step 2's server side done, and Home and
Activity moved off the full list (9 Oct 2026). Bank's own list, Bank-day and
the rest of step 3 still to do.**

9 Oct 2026: Render's logs had the account at 1.1-1.5 s - under the trigger -
but Home, Activity and Sort them out each asked for *every* account's whole
history. `GET /api/joint-account` now takes `limit`, `before` and
`month`+`year` (lib/account-page), describes only the rows it sends, and
answers exactly as before without them. Home asks for `month, year, limit=0`
(balance + `monthDeposits`/`monthDisbursements`, no entries); Activity for its
month only. The cursor is `id|date|createdAt`, so a row deleted since does not
lose the place.

## Why

`GET /api/joint-account` sends an account's whole history on every open: every
entry, the balance, and a running balance on each row. On 5 Oct 2026 a year of
M-Pesa (about 2,000 entries) took about 1.1 s to open, after the fix that
stopped it freezing the server (PR #598, `lib/transaction-details.ts`). That
time grows with the history: roughly three years, or a busy business account,
would take 3-5 s, and the phone downloads the whole history again each time.

**When to start step 2:** when Render's logs show the account taking more than
2-3 s regularly. Search the `jamvi` service's logs (last 24 hours) with
`/responseTime":\d{4,}/` and look for `GET /api/joint-account` lines.

## Step 1 - totals from the database (done)

`lib/account-ledger.ts`: the balance and the money-in/money-out totals are one
`SUM ... FILTER` query; each row's running balance is a window function
(`SUM(...) OVER (ORDER BY date, created_at, id)`). Nothing on screen changed.
This is what makes a page possible: any row's running balance is correct
without the rows before it. Checked against the old arithmetic in a real
Postgres on 2,687 made-up entries (future-dated ones, transfers, ties): equal
to within 0.001 KES.

## Step 2 - a paged version of the same request

- `GET /api/joint-account?accountId=..&limit=50&before=<cursor>` returns one page,
  newest first, plus `nextCursor` (null on the last page). The cursor is the
  last row's `(date, createdAt, id)` - the same order the list and the window
  function use - so pages never skip or repeat a row when entries are added.
- **Without `limit` the request behaves exactly as now.** Phones that have not
  taken the update keep working; nothing breaks on deploy day.
- The balance and totals still come from `ledgerTotals` on every page, so the
  header is right from the first page.
- Add `limit`/`before`/`nextCursor` to `lib/api-spec` and regenerate the client.
- List screens move to React Query's `useInfiniteQuery`, loading the next page
  at the end of the list (`FlatList onEndReached` on the phone, a "Show older"
  button or scroll trigger on the web):
  - phone: `app/(tabs)/bank.tsx`, `app/(tabs)/history.tsx`, `app/bank-day.tsx`
  - web: `src/pages/bank.tsx`, `src/pages/activity.tsx`, `src/pages/bank-day.tsx`
- Search and the month filter must move to the server (`q=`, `month=`), or they
  only search what is loaded. Same for anything that jumps to an old entry.
- Invalidation after a save stays the same query key prefix, so a new entry
  shows at the top without reloading every page.

## Step 3 - move the other screens off the full list

These read the whole list to work something out. Each needs its own small
request (or keeps the unpaged one until it has one). Do them one at a time;
each is shippable alone.

| Screen | What it takes from the full list | Replacement |
|---|---|---|
| Home (phone `app/(tabs)/index.tsx`, web `dashboard.tsx`) | balances, this month's in/out | a summary request: balance + this month's totals (`/api/mpesa/summary` already does part of this) |
| Goals (`app/(tabs)/goals.tsx`) | savings moves | goal totals from the server |
| Merry-go-round (phone + web) | contributions and payouts | the group's own rounds, already in `group_payouts` |
| Possible duplicates, sort entries (phone + web) | entries to compare | already have their own routes (`/api/possible-duplicates`, `/api/entries-to-sort`); drop the list dependency |
| Add expense (`app/add-expense.tsx`), expenses (web) | duplicate warning | `/api/possible-duplicates/check` already exists |
| M-Pesa import (phone + web) | receipts already saved | `/api/mpesa/import/check-receipts` already exists |

Done when no screen calls `GET /api/joint-account` without `limit`, and the
log search above shows it under 300 ms for the biggest account.
