import type { ColorValue } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { brandMark, featureIconStroke, featureIcons, type FeatureIconName } from '@moneylens/ui';
import { colors } from '@/lib/theme';

/** The MoneyLens mark (brand kit): teal line and arrow over teal and emerald bars. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G fill="none" stroke={colors.brand[600]} strokeLinecap="round" strokeLinejoin="round">
        <Path d={brandMark.line.d} strokeWidth={brandMark.line.strokeWidth} />
        <Path d={brandMark.arrow.d} strokeWidth={brandMark.arrow.strokeWidth} />
      </G>
      {brandMark.bars.map((bar) => (
        <Path
          key={bar.d}
          d={bar.d}
          fill={bar.tone === 'accent' ? colors.brand[500] : colors.brand[600]}
        />
      ))}
    </Svg>
  );
}

/** One of the brand kit's line icons, sized and coloured like a lucide icon. */
export function FeatureIcon({
  name,
  size = 24,
  color = colors.text,
}: {
  name: FeatureIconName;
  size?: number;
  color?: ColorValue;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <G
        fill="none"
        stroke={color}
        strokeWidth={featureIconStroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {featureIcons[name].map((shape, i) =>
          shape.tag === 'circle' ? (
            <Circle key={i} cx={shape.attr.cx} cy={shape.attr.cy} r={shape.attr.r} />
          ) : (
            <Path key={i} d={shape.attr.d} transform={shape.attr.transform} />
          ),
        )}
      </G>
    </Svg>
  );
}
