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

/** Where the arrows sit, clear of a header and the floating buttons. */
export type ScrollerInsets = { top: number; bottom: number };

type ScrollHandlers = {
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

/**
 * Up and down arrows at the right edge of a long page: a tap moves a screen,
 * holding one keeps the page moving until it is let go - a year of transactions took
 * minutes of flicking. Give it the list's own handlers (they are called too)
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
      handlers.onContentSizeChange?.(width, content);
    },
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
      // Moved by a finger or arrived where a jump was going: the jump is over.
      if (gliding.current.frame === null) targetRef.current = null;
      updateEdges(offsetRef.current);
      handlers.onScroll?.(event);
    },
  };

  const arrow = (direction: 'up' | 'down') => (
    <Pressable
      onPressIn={() => pressIn(direction)}
      onPressOut={release}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={direction === 'up' ? 'Up a screen. Hold to keep scrolling up.' : 'Down a screen. Hold to keep scrolling down.'}
      testID={`page-scroller-${direction}`}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 1 : 0.88,
        shadowColor: '#000',
        shadowOpacity: 0.15,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      })}
    >
      <Feather name={direction === 'up' ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
    </Pressable>
  );

  const thumb = show ? (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 10, top: insets.top, bottom: insets.bottom, justifyContent: 'flex-end', gap: 8 }} testID="page-scroller">
      {!edges.atTop ? arrow('up') : null}
      {!edges.atBottom ? arrow('down') : null}
    </View>
  ) : null;

  return { listProps, thumb };
}
