import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function LogoutIcon({ size = 24, color = "#333" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M23.9917 6H6V42H24"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M33 33L42 24L33 15"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 23.9917H42"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
