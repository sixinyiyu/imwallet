import Svg, { Circle, Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function ProfileIcon({ size = 24, color = "#333" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Circle
        cx="24" cy="16" r="10"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 42C6 34.268 12.268 28 20 28H28C35.732 28 42 34.268 42 42"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
