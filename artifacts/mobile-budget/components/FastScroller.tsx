import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useColors } from '@/hooks/useColors';

// A thumb this tall, on a track at the right edge; only for a list at least
// this many screens long - a short one scrolls fine without.
const THUMB_HEIGHT = 52;
const SCROLLER_MIN_SCREENS = 2.5;

/** Where the thumb's track starts and stops, clear of a header and the floating buttons. */
export type ScrollerInsets = { top: number; bottom: number };

type ScrollHandlers = {
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
};

/**
 * A thumb at the right edge that can be dragged to fly through a long page -
 * a year of transactions took minutes of flicking. Give it the list's own
 * handlers (they are called too) and a way to jump; spread `listProps` on the
 * list and put `thumb` beside it, both inside a `flex: 1` View.
 *
 * Sizes change rarely and are state; the offset changes every frame and is
 * only an animated value, so scrolling never re-renders the list.
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
  const offset = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const dragStart = useRef(0);
  const [dragging, setDragging] = useState(false);
  const scrollToRef = useRef(scrollTo);
  scrollToRef.current = scrollTo;

  const track = Math.max(0, sizes.height - (insets?.top ?? 0) - (insets?.bottom ?? 0));
  const trackRef = useRef(track);
  trackRef.current = track;
  const maxOffset = Math.max(1, sizes.content - sizes.height);
  const travel = Math.max(1, track - THUMB_HEIGHT);
  const show = insets != null && sizes.height > 0 && sizes.content > sizes.height * SCROLLER_MIN_SCREENS && track > THUMB_HEIGHT * 2;

  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => {
      const { height, content } = sizesRef.current;
      const room = Math.max(1, trackRef.current - THUMB_HEIGHT);
      dragStart.current = (offsetRef.current / Math.max(1, content - height)) * room;
      setDragging(true);
    },
    onPanResponderMove: (_event, gesture) => {
      const { height, content } = sizesRef.current;
      const room = Math.max(1, trackRef.current - THUMB_HEIGHT);
      const top = Math.min(room, Math.max(0, dragStart.current + gesture.dy));
      scrollToRef.current((top / room) * Math.max(0, content - height));
    },
    onPanResponderRelease: () => setDragging(false),
    onPanResponderTerminate: () => setDragging(false),
  }), []);

  if (!insets) return { listProps: handlers, thumb: null };

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
      offset.setValue(event.nativeEvent.contentOffset.y);
      handlers.onScroll?.(event);
    },
  };

  const thumb = show ? (
    <View pointerEvents="box-none" style={{ position: 'absolute', right: 0, top: insets.top, height: track, width: 30 }}>
      <Animated.View
        {...drag.panHandlers}
        accessibilityRole="adjustable"
        accessibilityLabel="Scroller - drag to move quickly through the page"
        testID="page-scroller"
        hitSlop={{ left: 12, top: 8, bottom: 8 }}
        style={{
          position: 'absolute',
          right: 2,
          width: 26,
          height: THUMB_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ translateY: offset.interpolate({ inputRange: [0, maxOffset], outputRange: [0, travel], extrapolate: 'clamp' }) }],
        }}
      >
        <View style={{ width: dragging ? 8 : 6, height: THUMB_HEIGHT - 8, borderRadius: 4, backgroundColor: colors.primary, opacity: dragging ? 0.95 : 0.6 }} />
      </Animated.View>
    </View>
  ) : null;

  return { listProps, thumb };
}
