import Svg, { Path, Circle } from "react-native-svg";

interface Props {
  size?: number;
}

export default function BtcIcon({ size = 32 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Circle cx="512" cy="512" r="512" fill="#F7931A" />
      <Path
        d="M670 450c10-66-40-101-109-125l22-90-54-13-22 88-43-11 22-88-54-13-22 90c-12-3-23-5-34-8l-75-19-14 58s40 9 39 10c22 5 26 20 25 31l-26 102c2 0 4 1 6 2l-6-1-36 145c-3 7-10 17-26 13 1 1-39-10-39-10l-27 62 71 18 39 10-23 90 54 13 22-90 43 11-22 90 54 13 22-90c89 17 156 10 184-71 23-65-1-102-48-126 34-8 60-30 67-76zM575 695c-16 65-126 30-162 22l29-115c36 9 150 27 133 93zM591 449c-15 59-106 29-136 22l26-105c30 8 126 22 110 83z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}
