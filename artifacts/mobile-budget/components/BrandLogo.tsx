import { Image, type ImageStyle, type StyleProp } from 'react-native';

type BrandLogoProps = {
  compact?: boolean;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

export function BrandLogo({
  compact = false,
  style,
  accessibilityLabel = 'Jamvi',
}: BrandLogoProps) {
  return (
    <Image
      source={
        compact
          ? require('../assets/images/branding/jamvi-mark.png')
          : require('../assets/images/branding/jamvi-wordmark.png')
      }
      resizeMode="contain"
      style={style}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}