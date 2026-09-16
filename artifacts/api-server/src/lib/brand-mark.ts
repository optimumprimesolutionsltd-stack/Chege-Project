import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The bundle's banner defines `__dirname`; running from source under ESM there
 * is no such global, and every path below would resolve against nothing. Ask
 * for whichever one this runtime actually has.
 */
const baseDir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

/**
 * The Jamvi mark, for the header of every PDF this server produces.
 *
 * Read from `dist/assets` first, where the build copies it. That is the same
 * lesson the pdfkit font metrics taught: a bundled server cannot reach back
 * into the repository, and a file it needs at runtime has to be put beside it
 * deliberately. The source paths below are the fallback for running from
 * source, where node_modules and the repo are both still there.
 *
 * Null is tolerated — the wordmark still prints — but the build copies the
 * file, so null should only ever happen outside a built server.
 */
function loadBrandMark(): Buffer | null {
  const candidates = [
    // Beside the bundle, put there by build.mjs.
    "assets/jamvi-mark-inline.png",
    // Running from source.
    "../../../jamvi-website/public/branding/jamvi-mark-inline.png",
    "../jamvi-website/dist/public/branding/jamvi-mark-inline.png",
    "../../jamvi-website/dist/public/branding/jamvi-mark-inline.png",
    "../../../jamvi-website/dist/public/branding/jamvi-mark-inline.png",
  ];
  for (const relative of candidates) {
    try {
      return readFileSync(path.resolve(baseDir, relative));
    } catch {
      // try the next
    }
  }
  return null;
}

export const BRAND_MARK: Buffer | null = loadBrandMark();

/**
 * Draws the mark at the start of a PDF header and returns how much horizontal
 * room it took, so the wordmark beside it can be placed either way. Zero when
 * there is no mark, which keeps every header working without one.
 */
export function drawBrandMark(
  document: { image: (src: Buffer, x: number, y: number, options: { width: number; height: number }) => void },
  x: number,
  y = 22,
): number {
  if (!BRAND_MARK) return 0;
  try {
    document.image(BRAND_MARK, x, y, { width: 26, height: 26 });
    return 34;
  } catch {
    // A corrupt or unreadable image must not cost the whole report.
    return 0;
  }
}
