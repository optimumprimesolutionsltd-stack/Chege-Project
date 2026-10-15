/**
 * The Google Play version of Jamvi takes no payment inside the app: people pay
 * on jamvi.co.ke and the app only shows where their subscription stands.
 * Google Play wants app subscriptions paid through Play Billing, so the Play
 * build has no M-Pesa prompt, no prices and no "Subscribe" buttons. The APK
 * from jamvi.co.ke keeps paying with M-Pesa as before.
 *
 * Which one is running is told by the build's update channel (eas.json "play"
 * builds on channel "play"), not by app config: an over-the-air update replaces
 * the config with the one it was published with, but never the channel.
 * The "play" channel is pointed at the production branch once
 * (`npx eas channel:edit play --branch production`), so the usual publish to
 * production reaches Play installs too, with no extra step.
 *
 * Kept free of React Native imports so it can be tested on its own;
 * lib/inAppPayments.ts reads the channel.
 */
export const PLAY_CHANNEL = 'play';

/** Whether a build on this update channel may take payment in the app. */
export function paymentsAllowedOn(channel: string | null | undefined): boolean {
  return channel !== PLAY_CHANNEL;
}

/**
 * The subscription banner's line without its "Tap to subscribe." / "Tap to pay."
 * ending, for a build where tapping cannot pay. What it says about the trial or
 * lapse stays.
 */
export function withoutPayPrompt(text: string): string {
  return text.replace(/\s*Tap to (subscribe|pay)\.\s*$/, '').trim();
}
