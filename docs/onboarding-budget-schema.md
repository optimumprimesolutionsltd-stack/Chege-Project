# Jamvi Onboarding and Budget Allocation Schema

## Design objective

Jamvi needs to preserve the distinction between **onboarding preferences**, **expense categories**, **planned expense allocations**, and **financial goals**. Personal and Shared budgets must remain separate even when they use the same category name, such as Food or Transport.

The schema should support new users, existing users with legacy categories, repeated onboarding, short-term budgets, custom categories, and the future Ask Jamvi assistant without deleting or rewriting historical financial records.

## Core rule

> **Categories such as Savings, Emergency fund, and Joint savings are not expenses.** They must be stored as goals or planned allocations, not as rows in the expense-category table.

## Existing tables to retain

The current database already contains the principal financial entities:

| Existing table | Purpose |
|---|---|
| `users` | Authenticated Jamvi users |
| `groups` | Personal and Shared workspaces |
| `group_memberships` | User membership and roles in Shared workspaces |
| `budget_categories` | Expense categories belonging to a workspace |
| `expenses` | Historical and current expense records |
| `income_sources` | User income streams within a workspace context |
| `savings_goals` | Savings and target-based planning |

Existing rows in these tables must remain untouched during onboarding migrations.

## Recommended entities

### 1. `onboarding_preferences`

Stores the user’s latest onboarding answers. This is user-level context and does not itself create a budget or expense category.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | integer identity | Primary key | Internal record identifier |
| `user_id` | varchar | Unique, FK to `users.id` | Owner of the preferences |
| `usage_mode` | text | Required | `personal`, `shared`, or `both` |
| `persona` | text | Nullable | `student`, `working`, `business`, `couple`, `friends`, `family`, `chama`, `club`, or future value |
| `budget_duration` | text | Required | `ongoing`, `week`, `month`, `quarter`, or `custom` |
| `budget_start_date` | date | Nullable | Start date for the selected plan |
| `budget_end_date` | date | Nullable | End date for a custom or short-term plan |
| `completed` | boolean | Required, default false | Whether onboarding was completed |
| `onboarding_version` | integer | Required | Version of the onboarding questionnaire |
| `created_at` | timestamptz | Required | Creation timestamp |
| `updated_at` | timestamptz | Required | Last update timestamp |

The existing implementation has this table with category and income arrays for the first persistence step. Those arrays should be retained temporarily for compatibility, then replaced by the normalized preference-selection tables below after the migration is verified.

### 2. `onboarding_category_selections`

Stores the user’s category choices before they are applied to a particular workspace. This allows the user to return to onboarding without losing their choices.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | integer identity | Primary key | Selection identifier |
| `onboarding_preference_id` | integer | FK, cascade delete | Parent onboarding record |
| `name` | text | Required | Category name selected by the user |
| `source` | text | Required | `recommended` or `custom` |
| `priority` | integer | Required | Onboarding display priority |
| `position` | integer | Required | Display order |
| `created_at` | timestamptz | Required | Creation timestamp |

Recommended constraint:

```text
UNIQUE(onboarding_preference_id, lower(name))
```

The database should use a case-insensitive unique index so `Food` and `food` cannot be selected twice in one onboarding session.

### 3. `budget_plans`

Represents a concrete planning period for a workspace. This is the correct parent for planned category amounts.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | integer identity | Primary key | Budget plan identifier |
| `group_id` | integer | Required, FK to `groups.id` | Personal or Shared workspace |
| `created_by_user_id` | varchar | Required, FK to `users.id` | User who created the plan |
| `name` | text | Required | Example: `September budget` or `Mombasa trip` |
| `purpose` | text | Nullable | Persona/use-case label or custom purpose |
| `duration_type` | text | Required | `ongoing`, `week`, `month`, `quarter`, `custom` |
| `start_date` | date | Required | First date covered by the plan |
| `end_date` | date | Nullable | End date for finite plans |
| `status` | text | Required, default `active` | `draft`, `active`, `completed`, or `archived` |
| `created_at` | timestamptz | Required | Creation timestamp |
| `updated_at` | timestamptz | Required | Last update timestamp |

A Personal and a Shared budget should have different `group_id` values. The same category name in each workspace is therefore intentionally separate.

Recommended constraints:

```text
CHECK(end_date IS NULL OR end_date >= start_date)
CHECK((duration_type = 'ongoing' AND end_date IS NULL) OR duration_type <> 'ongoing')
```

### 4. `budget_plan_categories`

Stores the planned amount for each expense category in a concrete budget plan. This is separate from the category master record and from actual expenses.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | integer identity | Primary key | Allocation identifier |
| `budget_plan_id` | integer | Required, FK to `budget_plans.id` | Parent plan |
| `budget_category_id` | integer | Nullable, FK to `budget_categories.id` | Existing workspace category, if one exists |
| `category_name` | text | Required | Snapshot of the displayed name |
| `planned_amount` | integer | Required, default 0 | Whole KES amount planned |
| `priority` | integer | Required, default 1 | Planning priority |
| `is_custom` | boolean | Required, default false | Whether user created the category during onboarding |
| `position` | integer | Required | Display order |
| `created_at` | timestamptz | Required | Creation timestamp |
| `updated_at` | timestamptz | Required | Last update timestamp |

Recommended constraints:

```text
CHECK(planned_amount >= 0)
UNIQUE(budget_plan_id, lower(category_name))
```

The amount is stored in the existing Jamvi format: **whole KES**, not cents.

The `category_name` snapshot is useful because a category may later be renamed. Historical budget plans should continue to show the name that was used when the plan was created.

### 5. `onboarding_budget_allocations`

If Jamvi needs to save category amounts before a concrete workspace or budget plan exists, use a temporary onboarding table.

| Column | Type | Constraints | Meaning |
|---|---|---|---|
| `id` | integer identity | Primary key | Allocation identifier |
| `onboarding_preference_id` | integer | FK | Parent onboarding record |
| `category_name` | text | Required | Selected expense category |
| `planned_amount` | integer | Required, default 0 | Planned whole KES amount |
| `created_at` | timestamptz | Required | Creation timestamp |
| `updated_at` | timestamptz | Required | Last update timestamp |

Recommended constraint:

```text
CHECK(planned_amount >= 0)
UNIQUE(onboarding_preference_id, lower(category_name))
```

When the user confirms budget creation, these rows are converted into `budget_plan_categories` in one transaction. If the user cancels, the onboarding draft can remain without affecting live financial data.

## Goals are separate from expenses

Savings-related planning should use the existing `savings_goals` model or a generalized goal table. It must not use `budget_categories` or `budget_plan_categories` as an expense row.

### Recommended goal fields

| Column | Type | Meaning |
|---|---|---|
| `group_id` | integer | Personal or Shared workspace owning the goal |
| `created_by_user_id` | varchar | User who created it |
| `name` | text | Example: Emergency fund, Joint savings, Trip fund |
| `goal_type` | text | `savings`, `emergency_fund`, `joint_savings`, `trip`, `school_fees`, `project`, or custom |
| `target_amount` | integer | Whole KES target |
| `current_amount` | integer | Whole KES progress |
| `target_date` | date | Optional deadline |
| `status` | text | `active`, `reached`, `paused`, or `archived` |

Examples:

| User intention | Storage destination |
|---|---|
| Food | Expense category and budget-plan allocation |
| Rent | Expense category and budget-plan allocation |
| Emergency fund | Goal |
| Joint savings | Shared goal |
| Trip fund | Goal, possibly alongside trip expenses |
| School fees | Goal, possibly alongside school-fee expenses |
| Chama project | Shared goal or project plan |

## Personal versus Shared separation

The workspace is the security boundary.

- Every `budget_plan` belongs to one `group_id`.
- Every `budget_plan_category` belongs to its parent plan and therefore to one workspace.
- Personal and Shared rows must never be merged merely because their names match.
- A duplicate-name check should compare categories within the target Shared workspace and also provide a user-facing notice when the same name exists in Personal.
- Existing expenses remain attached to their existing workspace and category context.

The duplicate warning is informational and should not delete or merge records. The user may keep a category such as Food in both workspaces because the two planned amounts and transaction histories are different.

## Existing-user migration strategy

The migration should be additive:

1. Create new preference and budget-plan tables.
2. Leave `users`, `groups`, `budget_categories`, `expenses`, `income_sources`, and goals unchanged.
3. Do not copy legacy categories automatically into a new plan unless the user explicitly confirms them.
4. When an existing user opens onboarding, preload their existing categories for review if desired, but do not silently change them.
5. When the user completes onboarding, create a new plan or update the selected workspace idempotently.
6. Treat a repeated category in Personal and Shared as separate workspace records.
7. Use unique constraints and a transaction to prevent duplicate rows during retries.

## Transaction when creating a budget

The final onboarding action should run as one server-side transaction:

```text
BEGIN

1. Verify the authenticated user.
2. Verify membership and permissions for the target workspace.
3. Create or find the budget plan for the target workspace and period.
4. For each selected expense category:
   a. Find the category within the target group by normalized name.
   b. Create it if missing and the user has manager permission.
   c. Upsert its budget-plan allocation with the planned KES amount.
5. Create or update the user’s income sources without duplicates.
6. Save onboarding completion and version.
7. Convert onboarding draft allocations into concrete plan allocations.

COMMIT
```

If any step fails, the transaction should roll back the new plan changes. Existing categories, expenses, and goals remain unchanged.

## API shape

The web and mobile apps should share the same API:

```text
GET  /api/onboarding/preferences
PUT  /api/onboarding/preferences
GET  /api/onboarding/duplicate-categories?groupId=<id>
PUT  /api/onboarding/category-selections
PUT  /api/onboarding/category-allocations
POST /api/budget-plans
GET  /api/budget-plans/:id
PUT  /api/budget-plans/:id/categories/:categoryId
```

The server must enforce authentication, workspace membership, workspace role, and Personal/Shared visibility. The mobile APK must not write directly to PostgreSQL.

## Ask Jamvi readiness

This model gives the AI assistant safe, structured inputs:

- `budget_plans` provides period and purpose.
- `budget_plan_categories` provides planned expense amounts.
- `expenses` provides actual spending.
- `income_sources` provides available income context.
- Goals provide target-based planning.
- `group_id` provides the Personal/Shared privacy boundary.

Ask Jamvi should receive a server-generated summary, not unrestricted database access.

## Recommended implementation order

1. Keep the existing additive `onboarding_preferences` table.
2. Add normalized category-selection and onboarding-allocation tables.
3. Add `budget_plans` and `budget_plan_categories`.
4. Connect the onboarding amount screen to these APIs.
5. Reuse the existing goals system for savings and emergency funds.
6. Add idempotent transaction handling.
7. Test existing-user retention and Personal/Shared privacy.
8. Use the same API from the mobile app.
9. Build Ask Jamvi on top of permission-aware budget summaries.

## Final decision

The correct model is:

```text
User
  └── Onboarding preferences
        ├── Selected expense categories
        ├── Planned category amounts
        └── Income-stream preferences

Workspace / Group
  └── Budget plan
        └── Budget-plan expense allocations
              └── Expense categories

Workspace / Group
  └── Goals
        ├── Savings
        ├── Emergency fund
        ├── Joint savings
        └── Other targets
```

This keeps onboarding flexible, budget allocations explicit, goals separate from expenses, and Personal and Shared finances safely isolated.
