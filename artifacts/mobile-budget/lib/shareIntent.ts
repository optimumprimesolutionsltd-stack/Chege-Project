import { Platform } from 'react-native';

type Hook = (options?: { resetOnBackground?: boolean }) => {
  hasShareIntent: boolean;
  shareIntent: { text?: string | null };
  resetShareIntent: () => void;
};

const idle: Hook = () => ({ hasShareIntent: false, shareIntent: { text: null }, resetShareIntent: () => {} });

/**
 * Android's Share button, if this build has it.
 *
 * The share target needs native code, which only a new build carries. An
 * update reaches every installed copy of the app, old builds included, and an
 * old build has no such module: importing it would fail at start. So it is
 * loaded here inside a try, and an old build simply behaves as if nobody ever
 * shares anything to it.
 */
let shareHook: Hook = idle;
let available = false;
if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('expo-share-intent') as { useShareIntent?: Hook };
    if (typeof module.useShareIntent === 'function') {
      shareHook = module.useShareIntent;
      available = true;
    }
  } catch {
    // An older build without the native module: sharing is not offered.
  }
}

/** True on a build that can receive shared text. */
export const canReceiveShares = available;

/** Text shared to Jamvi from another app, and the way to say it has been dealt with. */
export function useSharedText(): { text: string | null; clear: () => void } {
  // resetOnBackground off: the text is taken as soon as it arrives, and the
  // library must not drop it if the app is brought forward from the background.
  const { hasShareIntent, shareIntent, resetShareIntent } = shareHook({ resetOnBackground: false });
  return { text: hasShareIntent ? (shareIntent.text ?? null) : null, clear: () => resetShareIntent() };
}
