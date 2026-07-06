import Svg, { Path, Circle } from "react-native-svg";

interface Props { size?: number; }

export default function PendingIcon({ size = 64 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Circle cx="24" cy="24" r="22" fill="#F59E0B" />
      <Path d="M24 12V24L30 28" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
