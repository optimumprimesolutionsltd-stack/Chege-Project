/**
 * Run `refresh` once things have gone quiet, however many times this is called
 * in the meantime. Saving a day of banking is a dozen writes in a row; every
 * screen only needs to reload once, after the last of them.
 */
export function afterQuiet(refresh: () => void, waitMs = 250): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      refresh();
    }, waitMs);
  };
}
