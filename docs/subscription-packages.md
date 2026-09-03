# Jamvi subscription packages

The typed package catalogue is in `lib/jamvi-pricing`. It is shared by the API
and marketing website so prices, limits, savings, and feature wording do not
drift.

## Database setup

Migration `0017_subscription_packages.sql` creates:

- `subscription_plans`, including enabled state and package entitlements.
- `group_subscriptions`, including billing interval, lifecycle status, periods,
  and cancellation/expiry timestamps.
- A partial unique index that permits at most one current (`trial`, `pending`,
  `active`, or `past_due`) subscription per Shared budget.

The migration seeds all seven approved packages. The API also performs an
idempotent catalogue sync from the typed source when plans are listed. That sync
never re-enables a paid package that an administrator disabled.

## Package administration

There is deliberately no public endpoint for changing prices or enabled state.
`setPaidPackageEnabled` is an internal server capability for a future
platform-administrator screen. It cannot disable `PERSONAL_FREE`, and disabling
a paid package affects only new selections. Historical and current
subscriptions are not deleted.

## Payment boundary

This phase creates no checkout, M-Pesa, STK Push, payment callback, or recurring
billing code. A future payment service must create or activate subscriptions
through a trusted server boundary; client requests must never mark a paid plan
active.