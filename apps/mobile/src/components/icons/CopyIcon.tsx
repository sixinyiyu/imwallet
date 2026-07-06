import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function CopyIcon({ size = 24, color = "#2c2c2c" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        d="M85.312 85.312H640V320H554.688V170.688h-384v384H320V640H85.312V85.312zM384 384h554.688v554.688H384V384z m85.312 85.312v384h384v-384h-384z"
        fill={color}
      />
    </Svg>
  );
}
