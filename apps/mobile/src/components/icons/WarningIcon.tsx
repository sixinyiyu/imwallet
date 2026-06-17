import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function WarningIcon({ size = 48, color = "#F65450" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      <Path
        d="M511.504 0.992C229.008 0.992 0 230 0 512.512 0 794.976 229.008 1024 511.504 1024S1022.992 794.992 1022.992 512.48 794 0.992 511.52 0.992z m0 796.48c-21.92 0-36.512-14.64-36.512-36.512 0-21.92 14.64-36.512 36.512-36.512 21.856 0 36.512 14.656 36.512 36.512 0 21.92-14.592 36.512-36.512 36.512zM548 622.08c0 21.936-14.656 36.512-36.512 36.512-21.872 0-36.512-14.64-36.512-36.512V205.6c0-21.92 14.64-36.512 36.512-36.512 21.856 0 36.512 14.576 36.512 36.512v416.48z"
        fill={color}
      />
    </Svg>
  );
}
