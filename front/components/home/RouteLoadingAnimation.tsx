import React, { useEffect } from "react";
import Svg, { Line, Rect, Circle } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function RouteLoadingAnimation() {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 1800,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  // scanning bar
  const scannerProps = useAnimatedProps(() => {
    const x = interpolate(progress.value, [0, 1], [20, 180]);
    return {
      x,
    };
  });

  // active route reveal
  const activeLineProps = useAnimatedProps(() => {
    const x2 = interpolate(progress.value, [0, 1], [20, 180]);
    return { x2 };
  });

  // destination pulse
  const destProps = useAnimatedProps(() => {
    const scale = interpolate(progress.value, [0.7, 1], [1, 1.3]);

    return {
      transform: [{ scale }],
    };
  });

  return (
    <Svg width={220} height={100} viewBox="0 0 220 100">
      {/* base route */}
      <Line
        x1="20"
        y1="50"
        x2="180"
        y2="50"
        stroke="#DCE9FF"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* revealed route */}
      <AnimatedLine
        x1="20"
        y1="50"
        y2="50"
        stroke="#003EC7"
        strokeWidth="4"
        strokeLinecap="round"
        animatedProps={activeLineProps}
      />

      {/* scanner bar */}
      <AnimatedRect
        y="30"
        width="8"
        height="40"
        rx="4"
        fill="rgba(0,62,199,0.15)"
        animatedProps={scannerProps}
      />

      {/* start */}
      <Circle cx="20" cy="50" r="4" fill="#003EC7" />

      {/* destination */}
      <AnimatedCircle
        cx="180"
        cy="50"
        r="5"
        fill="#16A34A"
        animatedProps={destProps}
      />
    </Svg>
  );
}