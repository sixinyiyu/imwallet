import React from "react";
import Svg, { Rect, Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function ReceiveIcon({ size = 24, color = "#333" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Rect
        x="32" y="6" width="10" height="10"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
      <Rect
        x="32" y="32" width="10" height="10"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
      <Rect
        x="6" y="32" width="10" height="10"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
      <Rect
        x="6" y="6" width="10" height="10"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M8 24L30 24"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M38 24L40 24"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M24 37V39"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M24 17V31"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M24 8V10"
        stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}
