import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function ScanIcon({ size = 24, color = "#333" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M6 18V10C6 7.79086 7.79086 6 10 6H18"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M30 6H38C40.2091 6 42 7.79086 42 10V18"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M42 30V38C42 40.2091 40.2091 42 38 42H30"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18 42H10C7.79086 42 6 40.2091 6 38V30"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M2 24H46"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
      />
    </Svg>
  );
}
