import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function TransferIcon({ size = 24, color = "#333" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M24 6V42"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 18L24 6L36 18"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
