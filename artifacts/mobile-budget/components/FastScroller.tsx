import React, { useRef, useState } from 'react';
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

/** Where the arrows sit, clear of a header and the floating buttons. */
export type ScrollerInsets = { top: number; bottom: number };

type ScrollHandlers = {
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

/**
 * Up and down arrows at the right edge of a long page: a tap moves a screen,
 * a long press goes to the top or the bottom - a year of transactions took
 * minutes of flicking. Give it the list's own handlers (they are called too)
 * and a way to jump; spread `listProps` on the list and put `thumb` beside
 * it, both inside a `flex: 1` View.
 *
 * The offset is kept in a ref; state changes only when an arrow appears or
 * goes, so scrolling never re-renders the list.
 */
export function useFastScroller(
  insets: ScrollerInsets | undefined,
  scrollTo: (offset: number) => void,
  handlers: ScrollHandlers,
) {
  const colors = useColors();
  const [sizes, setSizes] = useState({ height: 0, content: 0 });
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  const offsetRef = useRef(0);
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
    scrollTo(Math.min(max, Math.max(0, target)));
  };

  if (!insets) return { listProps: handlers, thumb: null };

  const show = sizes.height > 0 && sizes.content > sizes.height * SCROLLER_MIN_SCREENS;

  const listProps = {
    scrollEventThrottle: 16,
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
      updateEdges(offsetRef.current);
      handlers.onScroll?.(event);
    },
  };

  const arrow = (direction: 'up' | 'down') => (
    <Pressable
      onPress={() => jump(direction)}
      onLongPress={() => jump(direction === 'up' ? 'top' : 'bottom')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={direction === 'up' ? 'Up a screen. Hold to go to the top.' : 'Down a screen. Hold to go to the bottom.'}
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
