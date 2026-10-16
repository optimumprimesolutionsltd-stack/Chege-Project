# SMS permission declaration

Needed only for the release that reads messages (the second one - see
[README.md](README.md)). Play Console › Policy › App content › Sensitive permissions ›
SMS and Call Log permissions, or the form Play opens when a bundle with READ_SMS is uploaded.

Google's rule (Permissions Help 10208820, checked 9 Oct 2026): READ_SMS and RECEIVE_SMS are
allowed under the exception **"SMS-based money management - apps that track and manage
budget"**, when reading SMS is the app's core function and there is no other way to provide it,
and the app does not take any non-financial or personal SMS.

## The form

**Permissions to declare:** `READ_SMS`, `RECEIVE_SMS`.

RECEIVE_SMS is only for the optional "tell me when an M-Pesa message arrives" notification
(modules/jamvi-sms, MpesaSmsReceiver), which sends nothing anywhere. If it makes the review
harder, leave it out: add `android.permission.RECEIVE_SMS` back to the blocked list for the
`play` build, and declare READ_SMS alone.

**Core functionality:** SMS-based money management.

**Description of how the app uses the permissions** (paste):

```
Jamvi is a budgeting app for Kenya, where most money moves through M-Pesa, Safaricom's mobile money service. Every M-Pesa payment and deposit arrives as an SMS from the sender "MPESA", and that SMS is the only record of it on the phone: M-Pesa offers no API for a person's own transactions.

With READ_SMS, Jamvi reads only messages from the sender MPESA, and only when the person asks: for a period they choose, or - if they turn it on - the new ones each time they open the app. Each message is turned into a budget entry (amount, date, who was paid, category) shown in a list for the person to check. Nothing is saved until they confirm it. Message text is sent to Jamvi's server to be read and is not stored; no other messages are ever read.

RECEIVE_SMS is used only to show a notification when a new message from MPESA arrives, so the person can bring it into their budget. It is optional, off by default, and sends nothing off the phone.

Without these permissions the person has to copy and paste every M-Pesa message by hand, which is the problem the app exists to solve.
```

**Is the app the default SMS handler?** No.

## Prominent disclosure

Shown in the app before Android's permission dialog, on the M-Pesa screen, as part of normal
use (not in settings or terms):

- Reading for a period: *"Only M-Pesa's messages, only for the period you choose, only when you
  ask. They are sent to Jamvi to be read into the list below, and are not kept: only the entries
  you save are stored."* - then the button the person taps, then Android asks.
- After the first statement: *"Let Jamvi read M-Pesa's new messages each time you open it -
  only M-Pesa's, only new ones after your statement. They are sent to Jamvi to be read, and are
  not kept: only the entries you save are stored."* - then "Read new M-Pesa messages for me".

Android's own dialog then says: *"Jamvi reads only M-Pesa's messages, only for the dates you
choose, and only when you ask..."* (lib/mpesaSms.ts).

## The video (Google may ask for one)

Under 90 seconds, a test phone with a test budget, screen-recorded:

1. Open Jamvi › M-Pesa. Show the first-time screen and its three steps.
2. Read a statement in; save a few entries.
3. Show the card "From here, Jamvi keeps up" and its words, tap **Read new M-Pesa messages for
   me**, and show Android's permission dialog appearing *after* the explanation. Allow.
4. Send a small M-Pesa payment from the test line; reopen Jamvi; show Home's "1 new M-Pesa
   message", the review list, and saving it.
5. Show the M-Pesa screen's switch to stop reading, and Android Settings › Apps › Jamvi ›
   Permissions › SMS.

Upload it unlisted to YouTube and paste the link into the form.
