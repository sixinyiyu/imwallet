import React from "react";
import Svg, { Path } from "react-native-svg";

interface BellIconProps {
  size?: number;
  color?: string;
}

export default function BellIcon({ size = 24, color = "#979797" }: BellIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        d="M528 176.32a240 240 0 0 1 240 240V736H288v-319.68a240 240 0 0 1 240-240z m0 64a176 176 0 0 0-175.872 168.896L352 416.32V672h352v-255.68a176 176 0 0 0-168.928-175.84l-7.072-0.16z"
        fill={color}
      />
      <Path
        d="M256 672m32 0l480 0q32 0 32 32l0 0q0 32-32 32l-480 0q-32 0-32-32l0 0q0-32 32-32Z"
        fill="#999999"
      />
      <Path
        d="M608 714.752h-160v22.72a80 80 0 0 0 160 0v-22.72z"
        fill="#999999"
      />
    </Svg>
  );
}