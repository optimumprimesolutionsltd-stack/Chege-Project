import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The desktop sidebar has to keep its own items inside itself.
 *
 * The rail is `h-screen`, and its nav had `flex-1` and nothing else. A flex
 * item defaults to `min-height: auto`, which means it will not shrink below
 * its content - so once the list was taller than the viewport the nav grew
 * past the rail and pushed the footer out with it.
 *
 * What made it hard to recognise is how it failed. Backgrounds only paint
 * inside the element, so the escaped items landed on the page in
 * `text-sidebar-foreground` - light text on a white page. They read as faded
 * or half-loaded rather than as a layout that had burst its container.
 *
 * It only showed up sometimes because it needs the list to be long enough: a
 * shared group adds entries, a lapsed subscription adds "Pay to continue", and
 * a short window does the rest.
 */
const source = readFileSync('src/components/layout.tsx', 'utf8');

/** The sidebar element and everything inside it, up to its closing tag. */
const desktopRail = source.slice(source.indexOf('<aside'), source.indexOf('</aside>'));

describe('the desktop sidebar', () => {
  it('is still a full-height rail', () => {
    expect(desktopRail).toContain('h-screen');
  });

  it('lets its nav shrink, so the rail cannot be burst', () => {
    // min-h-0 is the half that is easy to drop: overflow-y-auto alone does
    // nothing while the item refuses to shrink.
    expect(desktopRail).toContain('min-h-0');
  });

  it('scrolls the nav inside the rail', () => {
    expect(desktopRail).toContain('overflow-y-auto');
    expect(desktopRail).toContain('overscroll-contain');
  });

  it('keeps the footer pinned at the foot of the rail', () => {
    expect(desktopRail).toContain('mt-auto');
  });
});

describe('the mobile drawer, which always had this right', () => {
  it('still shrinks and scrolls its own nav', () => {
    const drawer = source.slice(source.indexOf('md:hidden'));
    expect(drawer).toContain('min-h-0 flex-1 overscroll-contain overflow-y-auto');
  });
});
