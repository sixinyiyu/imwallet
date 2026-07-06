import Svg, { Path, Circle } from "react-native-svg";

interface Props {
  size?: number;
}

export default function EthIcon({ size = 32 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Circle cx="512" cy="512" r="512" fill="#627EEA" />
      <Path
        d="M512 120v257l217 97-217-354z"
        fill="#FFFFFF"
        fillOpacity="0.602"
      />
      <Path d="M512 120L295 377l217-97V120z" fill="#FFFFFF" />
      <Path
        d="M512 652v217l217-126-217-91z"
        fill="#FFFFFF"
        fillOpacity="0.602"
      />
      <Path d="M512 869V652l-217-91 217 308z" fill="#FFFFFF" />
      <Path d="M512 608l217-126-217-97v223z" fill="#FFFFFF" fillOpacity="0.2" />
      <Path d="M295 482l217 126V359l-217 123z" fill="#FFFFFF" fillOpacity="0.602" />
    </Svg>
  );
}
