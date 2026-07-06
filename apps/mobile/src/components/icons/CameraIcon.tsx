import Svg, { Path } from "react-native-svg";

interface Props {
  size?: number;
  color?: string;
}

export default function CameraIcon({ size = 24, color = "#333" }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M24 34C32.2843 34 39 27.2843 39 19C39 10.7157 32.2843 4 24 4C15.7157 4 9 10.7157 9 19C9 27.2843 15.7157 34 24 34Z"
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <Path
        d="M24 25C27.3137 25 30 22.3137 30 19C30 15.6863 27.3137 13 24 13C20.6863 13 18 15.6863 18 19C18 22.3137 20.6863 25 24 25Z"
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.3686 34L16 44H32L28.6037 34H19.3686Z"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12 44H36"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
