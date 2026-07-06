import Svg, { Path, Circle } from "react-native-svg";

interface Props {
  size?: number;
}

export default function TronIcon({ size = 32 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Circle cx="512" cy="512" r="512" fill="#C53027" />
      <Path
        d="M730.283 307.072L213.333 213.333l272.043 674.56 379.05-455.083-134.143-125.738z m-8.32 41.301l79.061 74.07-197.034 30.89 117.973-104.96z m-184.192 104.96L309.803 267.008l372.608 67.541-144.64 118.784z m-16.214 32.939l-47.786 289.195-189.824-483.414 237.568 194.219z m34.39 16.085l239.488-42.752-278.272 315.862 38.784-273.11z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}