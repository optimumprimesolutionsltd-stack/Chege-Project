# Data safety

Play Console › Policy › App content › Data safety. Google's definitions matter here:

- **Collected** = sent off the phone, even if only for a moment. Data read only on the phone is
  not collected (the statement PDF is read on the phone).
- **Shared** = given to another company *except* service providers working for us (Render,
  Google sign-in, Resend, Safaricom, the AI provider, object storage) and *except* what the user
  chooses to share (records in a Shared group they joined). So Jamvi **shares nothing**.
- **Processed ephemerally** = used only in memory to answer the request, never stored.

## Overview questions

| Question | Answer |
|---|---|
| Does the app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by the app encrypted in transit? | **Yes** (HTTPS only) |
| Do you provide a way for users to request that their data is deleted? | **Yes** - in the app, and https://jamvi.co.ke/privacy#delete-account |

## Data types

Every row: **Shared: No.**

| Category › type | Collected | Required or optional | Ephemeral | Why |
|---|---|---|---|---|
| Personal info › Name | Yes | Required (from Google sign-in) | No | Account management, App functionality |
| Personal info › Email address | Yes | Required | No | Account management, App functionality (invitations, deletion code) |
| Personal info › Phone number | Yes | Optional (only to pay the subscription by M-Pesa) | No | App functionality (payment prompt) |
| Financial info › Purchase history | Yes | Optional (subscribers) | No | Account management |
| Financial info › Other financial info | Yes | Required (it is the app: entries, budgets, accounts, debts) | No | App functionality |
| Messages › SMS or MMS | Yes | Optional (only if the person allows reading) | **Yes** - read into a list, not stored; only the entries saved are kept, as Financial info | App functionality |
| Photos and videos › Photos | Yes | Optional (a profile photo) | No | App functionality |
| App activity › Other user-generated content | Yes | Optional (Ask Jamvi questions) | Confirm: are questions stored? If not, Yes | App functionality |

Not collected: location, contacts, calendar, files (the statement stays on the phone), audio,
health, web browsing, device IDs, crash logs, analytics. Jamvi has no analytics or advertising
SDK (checked 9 Oct 2026: package.json has none).

Entries saved from M-Pesa can carry part of another person's number - "John Kamau · 07…443",
what M-Pesa itself shows (#673). It is part of the person's own records, so it falls under
Financial info, not a separate type.

## Before submitting

- If Play Billing is added (see [README.md](README.md)), Google handles that payment; Purchase
  history stays as is.
- Name the AI provider in the privacy page once confirmed (Render settings).
- Check Ask Jamvi: are questions stored anywhere? Set the Ephemeral column from the answer.
