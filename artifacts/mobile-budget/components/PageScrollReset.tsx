import React, { useCallback, useRef } from 'react';
import {
  FlatList,
  type FlatListProps,
  Platform,
  ScrollView,
  type ScrollViewProps,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useFastScroller, type ScrollerInsets } from '@/components/FastScroller';

// Room kept between the field being typed in and the top of the keyboard.
const KEYBOARD_GAP = 24;

/**
 * A thumb at the right edge to drag through a long page, shown only once the
 * page is a few screens long. `top` and `bottom` keep its track clear of the
 * header and the floating buttons.
 */
type WithScroller = { scroller?: ScrollerInsets };

/**
 * Primary screen lists retain their position while tabs stay mounted. Reset
 * them on focus so opening a different page always starts from its heading.
 */
export const PageScrollView = React.forwardRef<ScrollView, ScrollViewProps & WithScroller>(function PageScrollView({ scroller, ...props }, forwardedRef) {
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

  const { listProps, thumb } = useFastScroller(
    scroller,
    (offset) => ref.current?.scrollTo({ y: offset, animated: false }),
    props,
  );

  // On a phone the keyboard covered whatever was being typed into: the page
  // did not move, so a password or an amount near the bottom was typed blind.
  // This scrolls the focused field clear of the keyboard, on every page built
  // on PageScrollView. A tap on a button while typing still lands.
  const list = Platform.OS !== 'web' ? (
    <KeyboardAwareScrollView
      ref={setRef as never}
      bottomOffset={KEYBOARD_GAP}
      keyboardShouldPersistTaps="handled"
      {...props}
      {...listProps}
    />
  ) : <ScrollView ref={setRef} {...props} {...listProps} />;
  if (!scroller) return list;
  return (
    <View style={{ flex: 1 }}>
      {list}
      {thumb}
    </View>
  );
});

/**
 * A plain ScrollView with the scroller, for pages opened on top of a tab - a
 * ledger keeps its place when an entry is opened and closed, so it is not reset.
 */
export const ScrollerScrollView = React.forwardRef<ScrollView, ScrollViewProps & WithScroller>(function ScrollerScrollView({ scroller, ...props }, forwardedRef) {
  const ref = useRef<ScrollView | null>(null);
  const setRef = useCallback((node: ScrollView | null) => {
    ref.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<ScrollView | null>).current = node;
  }, [forwardedRef]);
  const { listProps, thumb } = useFastScroller(
    scroller,
    (offset) => ref.current?.scrollTo({ y: offset, animated: false }),
    props,
  );
  if (!scroller) return <ScrollView ref={setRef} {...props} />;
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={setRef} {...props} {...listProps} />
      {thumb}
    </View>
  );
});

export function PageFlatList<ItemT>({ scroller, ...props }: FlatListProps<ItemT> & WithScroller) {
  const ref = useRef<FlatList<ItemT>>(null);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        ref.current?.scrollToOffset({ offset: 0, animated: false });
      });
      return () => cancelAnimationFrame(frame);
    }, []),
  );

  const { listProps, thumb } = useFastScroller(
    scroller,
    (offset) => ref.current?.scrollToOffset({ offset, animated: false }),
    props,
  );
  if (!scroller) return <FlatList ref={ref} {...props} />;
  return (
    <View style={{ flex: 1 }}>
      <FlatList ref={ref} {...props} {...listProps} />
      {thumb}
    </View>
  );
}
