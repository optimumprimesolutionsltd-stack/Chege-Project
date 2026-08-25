import React, { useCallback, useRef } from 'react';
import {
  FlatList,
  type FlatListProps,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Primary screen lists retain their position while tabs stay mounted. Reset
 * them on focus so opening a different page always starts from its heading.
 */
export function PageScrollView(props: ScrollViewProps) {
  const ref = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        ref.current?.scrollTo({ x: 0, y: 0, animated: false });
      });
      return () => cancelAnimationFrame(frame);
    }, []),
  );

  return <ScrollView ref={ref} {...props} />;
}

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