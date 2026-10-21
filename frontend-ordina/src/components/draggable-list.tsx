/**
 * A short list of equal-height rows reordered by dragging a handle. The dragged row follows
 * the finger and the others slide out of the way; `onMove(from, to)` runs on release.
 * Screen-reader users get "Move up" / "Move down" actions on each row instead.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

type DragState = { active: SharedValue<number>; hover: SharedValue<number>; dragY: SharedValue<number> };

const RowContext = createContext<{ index: number; count: number; height: number; state: DragState; onMove: (from: number, to: number) => void } | null>(null);

type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  rowHeight: number;
  gap?: number;
  onMove: (from: number, to: number) => void;
  renderRow: (item: T, index: number) => ReactNode;
};

export function DraggableList<T>({ items, keyOf, rowHeight, gap = 0, onMove, renderRow }: Props<T>) {
  const active = useSharedValue(-1);
  const hover = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const state = { active, hover, dragY };
  return (
    <View style={{ gap }}>
      {items.map((item, index) => (
        <RowContext.Provider key={keyOf(item)} value={{ index, count: items.length, height: rowHeight + gap, state, onMove }}>
          <DraggableRow>{renderRow(item, index)}</DraggableRow>
        </RowContext.Provider>
      ))}
    </View>
  );
}

function DraggableRow({ children }: { children: ReactNode }) {
  const context = useContext(RowContext)!;
  const { index, height, state } = context;
  const style = useAnimatedStyle(() => {
    if (state.active.value === index) {
      return { transform: [{ translateY: state.dragY.value }, { scale: 1.02 }], zIndex: 10, elevation: 8, opacity: 0.95 };
    }
    let shift = 0;
    if (state.active.value >= 0) {
      if (state.active.value < index && index <= state.hover.value) shift = -height;
      else if (state.hover.value <= index && index < state.active.value) shift = height;
    }
    return { transform: [{ translateY: withTiming(shift, { duration: 120 }) }, { scale: 1 }], zIndex: 0, elevation: 0, opacity: 1 };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Wrap the drag handle (e.g. a ≡ icon) of a row rendered by DraggableList. */
export function DragHandle({ children }: { children: ReactNode }) {
  const context = useContext(RowContext);
  if (!context) return <>{children}</>;
  const { index, count, height, state, onMove } = context;
  const pan = Gesture.Pan()
    .onStart(() => {
      state.active.set(index);
      state.hover.set(index);
      state.dragY.set(0);
    })
    .onUpdate((event) => {
      state.dragY.set(event.translationY);
      state.hover.set(Math.max(0, Math.min(count - 1, Math.round(index + event.translationY / height))));
    })
    .onEnd(() => {
      const to = state.hover.get();
      if (to !== index) runOnJS(onMove)(index, to);
    })
    .onFinalize(() => {
      state.active.set(-1);
      state.hover.set(-1);
      state.dragY.set(0);
    });
  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
}

/** Index and count of the row, for "Move up" / "Move down" accessibility actions. */
export function useRowPosition() {
  const context = useContext(RowContext);
  return context ? { index: context.index, count: context.count, move: context.onMove } : null;
}
