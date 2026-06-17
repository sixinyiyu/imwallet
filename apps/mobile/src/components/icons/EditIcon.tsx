import React from "react";
import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function EditIcon({ size = 24, color = "#6B7280" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
      <Path
        d="M690.816 171.84l90.944 93.824a52.544 52.544 0 0 1-0.768 73.92l-409.6 405.888h-124.48a38.848 38.848 0 0 1-38.848-38.912V586.368l427.904-415.36a38.848 38.848 0 0 1 54.912 0.832zM267.52 611.52v74.496h79.36l387.456-383.872-71.872-74.112L267.392 611.52z m-29.824 259.328c-16.384 0-29.696-14.336-29.696-32s13.312-32 29.696-32h548.608c16.384 0 29.696 14.336 29.696 32s-13.312 32-29.696 32H237.696z"
        fill={color}
      />
    </Svg>
  );
}
