import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 700;

export function OrdinaSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: { opacity: 1 },
    100: { opacity: 0, easing: Easing.out(Easing.quad) },
  });

  const logo = (
    <Image
      source={require('@/assets/images/ordina-logo-transparent.png')}
      style={styles.logo}
      contentFit="contain"
      accessibilityLabel="ORDINA"
    />
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.overlay}>
      {logo}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.overlay}>
      {logo}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  logo: {
    width: 280,
    height: 280,
  },
});
