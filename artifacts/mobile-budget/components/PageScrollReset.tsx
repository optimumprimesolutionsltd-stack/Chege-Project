import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  type FlatListProps,
  PanResponder,
  Platform,
  ScrollView,
  type ScrollViewProps,
  View,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useFocusEffect } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

// Room kept between the field being typed in and the top of the keyboard.
const KEYBOARD_GAP = 24;

/**
 * Primary screen lists retain their position while tabs stay mounted. Reset
 * them on focus so opening a different page always starts from its heading.
 */
export const PageScrollView = React.forwardRef<ScrollView, ScrollViewProps>(function PageScrollView(props, forwardedRef) {
  const ref = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        ref.current?.scrollTo({ x: 0, y: 0, animated: false });
      });
      return () => cancelAnimationFrame(frame);
    }, []),
  );

  // The focus reset needs its own handle, but a screen may also want to scroll
  // itself — jumping to the section a summary card describes, say — so keep
  // both: ours drives the reset, the caller's is handed the same node.
  const setRef = useCallback((node: ScrollView | null) => {
    (ref as React.MutableRefObject<ScrollView | null>).current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<ScrollView | null>).current = node;
  }, [forwardedRef]);

  // On a phone the keyboard covered whatever was being typed into: the page
  // did not move, so a password or an amount near the bottom was typed blind.
  // This scrolls the focused field clear of the keyboard, on every page built
  // on PageScrollView. A tap on a button while typing still lands.
  if (Platform.OS !== 'web') {
    return (
      <KeyboardAwareScrollView
        ref={setRef as never}
        bottomOffset={KEYBOARD_GAP}
        keyboardShouldPersistTaps="handled"
        {...props}
      />
    );
  }
  return <ScrollView ref={setRef} {...props} />;
});

// A thumb this tall, on a track at the right edge; only for a list at least
// this many screens long - a short one scrolls fine with a thumb.
const THUMB_HEIGHT = 52;
const SCROLLER_MIN_SCREENS = 2.5;

type PageFlatListProps<ItemT> = FlatListProps<ItemT> & {
  /**
   * A thumb at the right edge that can be dragged to fly through a long
   * list - a year of transactions took minutes of flicking. `top` and
   * `bottom` keep its track clear of the header and the floating buttons.
   */
  scroller?: { top: number; bottom: number };
};

export function PageFlatList<ItemT>({ scroller, ...props }: PageFlatListProps<ItemT>) {
  const ref = useRef<FlatList<ItemT>>(null);
  const colors = useColors();

  // Sizes change rarely and are state; the offset changes every frame and is
  // only ever an animated value, so scrolling never re-renders the list.
  const [sizes, setSizes] = useState({ height: 0, content: 0 });
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  const offset = useRef(new Animated.Value(0)).current;
  const offsetRef = useRef(0);
  const dragStart = useRef(0);
  const [dragging, setDragging] = useState(false);

  const track = Math.max(0, sizes.height - (scroller?.top ?? 0) - (scroller?.bottom ?? 0));
  const trackRef = useRef(track);
  trackRef.current = track;
  const maxOffset = Math.max(1, sizes.content - sizes.height);
  const travel = Math.max(1, track - THUMB_HEIGHT);
  const showScroller = scroller != null && sizes.height > 0 && sizes.content > sizes.height * SCROLLER_MIN_SCREENS && track > THUMB_HEIGHT * 2;

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
      ref.current?.scrollToOffset({ offset: (top / room) * Math.max(0, content - height), animated: false });
    },
    onPanResponderRelease: () => setDragging(false),
    onPanResponderTerminate: () => setDragging(false),
  }), []);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        ref.current?.scrollToOffset({ offset: 0, animated: false });
      });
      return () => cancelAnimationFrame(frame);
    }, []),
  );

  if (!scroller) return <FlatList ref={ref} {...props} />;
  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={ref}
        {...props}
        scrollEventThrottle={16}
        onLayout={(event) => {
          const height = event.nativeEvent.layout.height;
          setSizes((current) => (current.height === height ? current : { ...current, height }));
          props.onLayout?.(event);
        }}
        onContentSizeChange={(width, content) => {
          setSizes((current) => (current.content === content ? current : { ...current, content }));
          props.onContentSizeChange?.(width, content);
        }}
        onScroll={(event) => {
          offsetRef.current = event.nativeEvent.contentOffset.y;
          offset.setValue(event.nativeEvent.contentOffset.y);
          props.onScroll?.(event);
        }}
      />
      {showScroller ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: 0, top: scroller.top, height: track, width: 30 }}>
          <Animated.View
            {...drag.panHandlers}
            accessibilityRole="adjustable"
            accessibilityLabel="Scroller - drag to move quickly through the list"
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
      ) : null}
    </View>
  );
}