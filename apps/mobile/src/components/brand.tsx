import type { ColorValue } from 'react-native';
import Svg, { Circle, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { brandMark, featureIconStroke, featureIcons, type FeatureIconName } from '@moneylens/ui';
import { colors } from '@/lib/theme';

/** The MoneyLens mark, shaded from emerald to teal. */
export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox={brandMark.viewBox}>
      <Defs>
        <LinearGradient
          id="brandMarkShade"
          gradientUnits="userSpaceOnUse"
          x1="20"
          y1="90"
          x2="90"
          y2="15"
        >
          <Stop offset="0" stopColor={colors.brand[500]} />
          <Stop offset="1" stopColor={colors.brand[600]} />
        </LinearGradient>
      </Defs>
      <Path d={brandMark.bars.d} fill="url(#brandMarkShade)" />
      <Path
        d={brandMark.line.d}
        fill="none"
        stroke="url(#brandMarkShade)"
        strokeWidth={brandMark.line.strokeWidth}
        strokeLinejoin="round"
      />
      <Path
        d={brandMark.arrowHead.d}
        fill="url(#brandMarkShade)"
        stroke="url(#brandMarkShade)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
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
