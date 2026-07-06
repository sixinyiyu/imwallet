import Svg, { Path } from "react-native-svg";

interface BellIconProps {
  size?: number;
  color?: string;
}

export default function BellIcon({ size = 24, color = "#8F9BB3" }: BellIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Path
        d="M383.856054 896.047982h255.904036a127.952018 127.952018 0 0 1-255.904036 0z m447.832063-63.976009H63.976009a63.976009 63.976009 0 0 1 0-127.952018h63.976009v-319.880045a383.856054 383.856054 0 1 1 767.712108 0v319.880045h63.976009a63.976009 63.976009 0 0 1 0 127.952018z m-575.784081-447.832063v319.880045h511.808072v-319.880045a255.904036 255.904036 0 0 0-511.808072 0z"
        fill={color}
      />
    </Svg>
  );
}
