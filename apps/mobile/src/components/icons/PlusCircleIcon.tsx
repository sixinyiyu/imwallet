import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function PlusCircleIcon({ size = 24, color = "#007FFF" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      <Path
        d="M512 0c282.752 0 512 229.248 512 512s-229.248 512-512 512S0 794.752 0 512 229.248 0 512 0z m21.333333 533.333333h170.666667a21.333333 21.333333 0 1 0 0-42.666666h-170.666667v-170.666667a21.333333 21.333333 0 1 0-42.666666 0v170.666667h-170.666667a21.333333 21.333333 0 1 0 0 42.666666h170.666667v170.666667a21.333333 21.333333 0 1 0 42.666666 0v-170.666667z"
        fill={color}
      />
    </Svg>
  );
}
