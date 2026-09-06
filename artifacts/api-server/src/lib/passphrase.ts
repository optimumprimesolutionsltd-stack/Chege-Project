import { randomInt } from "node:crypto";

/**
 * A passphrase for a view link, generated rather than invented.
 *
 * Left to choose their own, people pick the group's name and the year. This
 * has to survive being said out loud at a meeting and typed by somebody on a
 * phone, so it is words rather than characters: "kikapu-jembe-taa-4820" is
 * repeatable across a room in a way that "K7#mQ2z!" is not.
 *
 * Words are short, common, and unambiguous when spoken - no pairs that sound
 * alike, nothing that changes meaning when misheard. Half are everyday Swahili
 * because the people saying them aloud are in Kenya.
 */

const WORDS = [
  // Everyday Swahili nouns: short, concrete, unmistakable when spoken.
  "kikapu", "jembe", "taa", "meza", "kiti", "mlango", "dirisha", "kikombe",
  "sufuria", "kitabu", "kalamu", "barua", "gari", "baiskeli", "ndege", "samaki",
  "kuku", "mbuzi", "ngombe", "punda", "simba", "tembo", "twiga", "nyani",
  "mti", "jani", "ua", "mbegu", "mvua", "jua", "mwezi", "nyota",
  "bahari", "mto", "mlima", "shamba", "soko", "duka", "shule", "nyumba",
  "chumvi", "sukari", "maziwa", "mkate", "wali", "maharagwe", "ndizi", "embe",
  // Plain English, chosen the same way.
  "basket", "ladder", "window", "kettle", "pillow", "blanket", "candle", "mirror",
  "garden", "harvest", "river", "mountain", "island", "forest", "meadow", "valley",
  "anchor", "compass", "lantern", "hammer", "bucket", "basketball", "guitar", "drum",
  "orange", "melon", "pepper", "ginger", "honey", "butter", "biscuit", "coconut",
  "yellow", "purple", "silver", "golden", "crimson", "emerald", "amber", "indigo",
  "swift", "gentle", "steady", "clever", "quiet", "bright", "humble", "eager",
  "monday", "harbour", "market", "village", "bridge", "tower", "castle", "temple",
  "falcon", "otter", "badger", "walrus", "panther", "dolphin", "penguin", "sparrow",
] as const;

/** Three words and four digits. With this list that is roughly 34 bits, which
 *  against a limiter allowing 10 attempts every 15 minutes is tens of thousands
 *  of years of guessing - the link, not the passphrase, is the long secret. */
const WORD_COUNT = 3;

export function generatePassphrase(): string {
  // randomInt, not Math.random: this is a credential, and randomInt draws from
  // the same source as the token beside it and is free of modulo bias.
  const words = Array.from({ length: WORD_COUNT }, () => WORDS[randomInt(WORDS.length)]);
  const digits = String(randomInt(1000, 10000));
  return [...words, digits].join("-");
}

/** Exposed for the test that checks the list is fit for saying out loud. */
export const PASSPHRASE_WORDS = WORDS;
