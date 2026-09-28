import React, { useCallback, useRef } from 'react';
import {
  FlatList,
  type FlatListProps,
  Platform,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';
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

export function PageFlatList<ItemT>(props: FlatListProps<ItemT>) {
  const ref = useRef<FlatList<ItemT>>(null);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        ref.current?.scrollToOffset({ offset: 0, animated: false });
      });
      return () => cancelAnimationFrame(frame);
    }, []),
  );

  return <FlatList ref={ref} {...props} />;
}