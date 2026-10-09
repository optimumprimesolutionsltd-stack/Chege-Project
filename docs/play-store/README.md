# Jamvi on Google Play - the kit

Prepared 9 Oct 2026, while the Play developer account does not exist yet. Everything
Google will ask for is here, in the order it is asked. Nothing has been submitted.

| File | What it is |
|---|---|
| [README.md](README.md) | This page: the decision to make first, then the steps in order |
| [listing.md](listing.md) | Store listing text, category, contact details, screenshots to take |
| [data-safety.md](data-safety.md) | Answers for Play Console's Data safety form |
| [sms-declaration.md](sms-declaration.md) | The SMS permission declaration, and the video to record |
| [app-content.md](app-content.md) | The other App content forms: ads, rating, audience, app access, financial features, account deletion |
| [signing-and-release.md](signing-and-release.md) | Keeping the APK's signing key, the build, version numbers, and how updates keep working |

## Decide first: how a Play user pays

Google Play requires its own billing for anything sold inside an app from the Play Store -
subscriptions included, and the policy names "financial management software" as an example.
An app from Play may not take payment another way, nor point people to one (a link, a button,
or wording like "pay on our website"). The programmes that allow other payment methods cover
the EEA, UK, Australia, Brazil, Indonesia, Japan, South Africa, India, South Korea and the US -
**not Kenya** (checked 9 Oct 2026, Play Console Help 9858738 and 13821247).

Today the app sells the subscription through M-Pesa STK Push. On Play that is not allowed. The
choices:

1. **Google Play Billing in the Play build.** Play users subscribe through Google Play; Google
   keeps 15% of a subscription. The APK and the web keep M-Pesa. Work on our side: Play Billing
   in the app, a server check of Google's receipts, and the subscription status shared across
   both ways of paying. The largest piece of work here - and Google's own payment methods in
   Kenya need checking before relying on it.
2. **No buying in the Play build at all.** Play users who already subscribed (on the web or the
   APK) use it in full. Anyone else sees that the trial has ended, with no word on where to pay -
   Google forbids even that. Little work, but people from Play would rarely become paying users.
3. **Stay off Play for now.** Keep the APK and the website, and wait for Google to clear the
   Chrome block on the message-reading APK (appeal sent 6 Oct 2026).

Nothing below depends on the choice except the payment screens, so the rest can go ahead.

## The steps, in order

1. **D-U-N-S number** for Optimum Prime Solutions Ltd - free from Dun & Bradstreet (Play Console
   links to the request form). Days to about a month.
2. **Play developer account** at play.google.com/console - *Organisation*, US$25 once, with the
   Google account that should own Jamvi for good. Developer name: **Jamvi**. Verify the website
   (jamvi.co.ke is already in Search Console), contact email info@jamvi.co.ke, and phone.
   An organisation account skips the "12 testers for 14 days" rule that new personal accounts have.
3. **Create the app**: name Jamvi, default language English (United Kingdom), app (not game),
   free (subscriptions are not a price on the app).
4. **App signing**: give Play the APK's existing key, so the Play version installs over the APK
   and keeps people's data - see [signing-and-release.md](signing-and-release.md). Do this before
   the first upload; it cannot be changed afterwards.
5. **App content** forms: [app-content.md](app-content.md), [data-safety.md](data-safety.md).
6. **Store listing**: [listing.md](listing.md).
7. **First release, without SMS reading**: the `play` build (`JAMVI_PLAY_STORE=1`) leaves READ_SMS
   out, so it needs no SMS declaration and is reviewed on its own. Production track, Kenya.
8. **Second release, with SMS reading**: remove `JAMVI_PLAY_STORE` from the `play` profile, build,
   and submit with the declaration in [sms-declaration.md](sms-declaration.md). If Google asks
   questions, the first release is already live meanwhile.
9. **Then**: the website's Download button can point at the Play listing (`JAMVI_APK_URL` on
   Render), and the computer-and-WhatsApp steps can go.

## Done in code with this kit

- **Prominent disclosure** (Google's rule for SMS): both places that lead to Android's SMS
  permission now say the messages are *sent to Jamvi to be read* and *not kept* - not only that
  they are not kept (app/mpesa-import.tsx).
- **No camera permission**: expo-image-picker declares CAMERA, but the app only ever opens the
  photo library. Blocked in every build (app.config.js), so Google has one permission fewer to
  question.
- **Privacy page**: now names the M-Pesa number taken for subscription payments, Safaricom as
  the payment processor, and the AI provider Ask Jamvi uses; and has a *Deleting your account*
  section at jamvi.co.ke/privacy#delete-account, the address Google asks for.

## To confirm in the morning

- **Which AI provider** Ask Jamvi uses in production (Render: `ASK_JAMVI_API_URL`, or the
  managed `AI_INTEGRATIONS_OPENAI_*`). The privacy page says "an AI model provider"; it should
  name it, and Data safety lists it as a service provider.
- **The payment decision** above.
- **Who owns the Google account** the Play developer account is made on.
