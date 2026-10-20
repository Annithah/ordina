import { Image } from 'expo-image';
import { StyleSheet, View, type ViewStyle } from 'react-native';

type OrdinaLogoProps = {
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
};

const sizes = {
  sm: { width: 160, height: 160 },
  md: { width: 220, height: 220 },
  lg: { width: 280, height: 280 },
};

export function OrdinaLogo({ size = 'md', style }: OrdinaLogoProps) {
  return (
    <View style={[styles.frame, sizes[size], style]}>
      <Image
        source={require('@/assets/images/ordina-logo-transparent.png')}
        style={styles.image}
        contentFit="contain"
        accessibilityLabel="ORDINA. Put order in your day."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
