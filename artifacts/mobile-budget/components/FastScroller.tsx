import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

// Only for a page at least this many screens long - a short one scrolls fine without.
const SCROLLER_MIN_SCREENS = 2.5;
// A jump leaves a little of the last screen showing, so the place is not lost.
const PAGE_OVERLAP = 80;
const EDGE = 24;
// Held past HOLD_DELAY, the page glides: pixels a second to start, how much
// faster each second, and the fastest. By time, not by tick, so a frame the
// phone drops while drawing the list does not slow the page down.
const HOLD_DELAY = 350;
const GLIDE_START = 900;
const GLIDE_ACCELERATION = 2_400;
const GLIDE_MAX = 4_500;
// The position is only needed to know where to jump from and which arrows to
// show: a few times a second is plenty, and every report costs the phone.
const SCROLL_REPORT_MS = 48;
// After "to the end" the page keeps following its end this long, while the
// rest of a list drawn a batch at a time is still being added below.
const FOLLOW_END_MS = 3_000;

/**
 * Where the arrows sit, clear of a header and the floating buttons.
 *
 * `findCategory` puts a search button on top of the column, on a page that
 * lists categories: it is handed a way to scroll the page, and opens the
 * page's own "Search categories" box. `beforeEnd` runs before "to the end" -
 * a page that draws its list a batch at a time draws the rest, so the end is
 * the real last entry.
 */
export type ScrollerInsets = {
  top: number;
  bottom: number;
  findCategory?: (scrollTo: (offset: number) => void) => void;
  beforeEnd?: () => void;
};

type ScrollHandlers = {
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

/**
 * Up and down arrows at the right edge of a long page: a tap moves a screen,
 * holding one keeps the page moving until it is let go - a year of transactions took
 * minutes of flicking. Beside them, "to the top" and "to the end", and on a
 * page of categories a button to find one. Give it the list's own handlers (they are called too)
 * and a way to jump; spread `listProps` on the list and put `thumb` beside
 * it, both inside a `flex: 1` View.
 *
 * The offset is kept in a ref; state changes only when an arrow appears or
 * goes, so scrolling never re-renders the list.
 */
export function useFastScroller(
  insets: ScrollerInsets | undefined,
  scrollTo: (offset: number, animated: boolean) => void,
  handlers: ScrollHandlers,
) {
  const colors = useColors();
  const scrollToRef = useRef(scrollTo);
  scrollToRef.current = scrollTo;
  const [sizes, setSizes] = useState({ height: 0, content: 0 });
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  const offsetRef = useRef(0);
  // Where the last tap sent the page: an animated jump is still on its way when
  // a hold starts, and gliding from the old spot would pull the page back.
  const targetRef = useRef<number | null>(null);
  const [edges, setEdges] = useState({ atTop: true, atBottom: false });
  const edgesRef = useRef(edges);

  const updateEdges = (offset: number) => {
    const { height, content } = sizesRef.current;
    const next = { atTop: offset <= EDGE, atBottom: offset >= content - height - EDGE };
    if (next.atTop !== edgesRef.current.atTop || next.atBottom !== edgesRef.current.atBottom) {
      edgesRef.current = next;
      setEdges(next);
    }
  };

  const jump = (to: 'up' | 'down' | 'top' | 'bottom') => {
    const { height, content } = sizesRef.current;
    const max = Math.max(0, content - height);
    const step = Math.max(100, height - PAGE_OVERLAP);
    const target = to === 'top' ? 0 : to === 'bottom' ? max : to === 'up' ? offsetRef.current - step : offsetRef.current + step;
    const next = Math.min(max, Math.max(0, target));
    targetRef.current = next;
    scrollToRef.current(next, true);
  };

  // A tap moves a screen the moment the arrow is touched - it used to wait for
  // the finger to lift, which read as lag on every tap. Still held after
  // HOLD_DELAY, the page glides on, faster the longer it is held, until the
  // finger lifts or the end is reached. Driven by the screen's frames and
  // timed by the clock (not onLongPress, which Android cancels on the
  // smallest wobble, nor a fixed timer, whose ticks a busy phone drops).
  const gliding = useRef<{ hold: ReturnType<typeof setTimeout> | null; frame: number | null; speed: number; offset: number; last: number }>({ hold: null, frame: null, speed: 0, offset: 0, last: 0 });
  const stopGlide = () => {
    const glide = gliding.current;
    if (glide.hold !== null) clearTimeout(glide.hold);
    if (glide.frame !== null) cancelAnimationFrame(glide.frame);
    glide.hold = null;
    glide.frame = null;
  };
  const pressIn = (direction: 'up' | 'down') => {
    stopGlide();
    jump(direction);
    gliding.current.hold = setTimeout(() => {
      const glide = gliding.current;
      glide.hold = null;
      glide.speed = GLIDE_START;
      glide.offset = targetRef.current ?? offsetRef.current;
      glide.last = Date.now();
      const step = () => {
        const now = Date.now();
        const seconds = Math.min(0.1, (now - glide.last) / 1000);
        glide.last = now;
        const { height, content } = sizesRef.current;
        const max = Math.max(0, content - height);
        glide.offset = Math.min(max, Math.max(0, glide.offset + (direction === 'up' ? -1 : 1) * glide.speed * seconds));
        glide.speed = Math.min(GLIDE_MAX, glide.speed + GLIDE_ACCELERATION * seconds);
        targetRef.current = glide.offset;
        scrollToRef.current(glide.offset, false);
        if ((direction === 'up' && glide.offset <= 0) || (direction === 'down' && glide.offset >= max)) {
          stopGlide();
          return;
        }
        glide.frame = requestAnimationFrame(step);
      };
      glide.frame = requestAnimationFrame(step);
    }, HOLD_DELAY);
  };
  // Lifting the finger only stops a glide: the tap already moved the page.
  const release = () => stopGlide();
  useEffect(() => stopGlide, []);

  // "To the end": the page may still be drawing the rest of its list, so for
  // a moment it follows the end as the list grows. A finger on the page, or
  // any other button, lets go.
  const followEndUntil = useRef(0);
  const toEnd = () => {
    stopGlide();
    insets?.beforeEnd?.();
    followEndUntil.current = Date.now() + FOLLOW_END_MS;
    jump('bottom');
  };
  const toTop = () => {
    stopGlide();
    followEndUntil.current = 0;
    jump('top');
  };
  const findCategory = () => {
    stopGlide();
    followEndUntil.current = 0;
    insets?.findCategory?.((offset) => {
      const { height, content } = sizesRef.current;
      const next = Math.min(Math.max(0, content - height), Math.max(0, offset));
      targetRef.current = next;
      scrollToRef.current(next, true);
    });
  };

  if (!insets) return { listProps: handlers, thumb: null };

  const show = sizes.height > 0 && sizes.content > sizes.height * SCROLLER_MIN_SCREENS;

  const listProps = {
    scrollEventThrottle: SCROLL_REPORT_MS,
    onLayout: (event: LayoutChangeEvent) => {
      const height = event.nativeEvent.layout.height;
      setSizes((current) => (current.height === height ? current : { ...current, height }));
      handlers.onLayout?.(event);
    },
    onContentSizeChange: (width: number, content: number) => {
      setSizes((current) => (current.content === content ? current : { ...current, content }));
      if (Date.now() < followEndUntil.current) {
        const end = Math.max(0, content - sizesRef.current.height);
        targetRef.current = end;
        scrollToRef.current(end, false);
      }
      handlers.onContentSizeChange?.(width, content);
    },
    onScrollBeginDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      followEndUntil.current = 0;
      handlers.onScrollBeginDrag?.(event);
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
      // Moved by a finger or arrived where a jump was going: the jump is over.
      if (gliding.current.frame === null) targetRef.current = null;
      updateEdges(offsetRef.current);
      handlers.onScroll?.(event);
    },
  };

  const buttonStyle = {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  } as const;

  const arrow = (direction: 'up' | 'down') => (
    <Pressable
      onPressIn={() => pressIn(direction)}
      onPressOut={release}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={direction === 'up' ? 'Up a screen. Hold to keep scrolling up.' : 'Down a screen. Hold to keep scrolling down.'}
      testID={`page-scroller-${direction}`}
      style={({ pressed }) => [buttonStyle, { opacity: pressed ? 1 : 0.88 }]}
    >
      <Feather name={direction === 'up' ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
    </Pressable>
  );

  // One tap each, no hold: find a category, the top, the end.
  const button = (key: 'find' | 'top' | 'end', icon: keyof typeof Feather.glyphMap, label: string, onPress: () => void) => (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={`page-scroller-${key}`}
      style={({ pressed }) => [buttonStyle, { opacity: pressed ? 1 : 0.88 }]}
    >
      <Feather name={icon} size={20} color={colors.primary} />
    </Pressable>
  );

  const thumb = show ? (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 10, top: insets.top, bottom: insets.bottom, justifyContent: 'flex-end', gap: 8 }} testID="page-scroller">
      {insets.findCategory ? button('find', 'search', 'Find a category', findCategory) : null}
      {!edges.atTop ? button('top', 'chevrons-up', 'To the top', toTop) : null}
      {!edges.atTop ? arrow('up') : null}
      {!edges.atBottom ? arrow('down') : null}
      {!edges.atBottom ? button('end', 'chevrons-down', 'To the end', toEnd) : null}
    </View>
  ) : null;

  return { listProps, thumb };
}
