import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { FLAT_ICON_LIST } from "./iconData";
import type { SxProps } from "@mui/material";
import type { Theme } from "@mui/system";

interface SelectedIconProps {
  name: string | null;
  size?: number;
  color?: string;
  sx?: SxProps<Theme>;
}

export function SelectedIcon({
  name,
  size = 28,
  color,
  sx,
}: SelectedIconProps) {
  if (!name) return null;

  const icon = FLAT_ICON_LIST.find((i) => i.name === name);

  if (!icon) {
    return <HelpOutlineIcon sx={{ fontSize: size, color, ...sx }} />;
  }

  const Icon = icon.Icon;

  return <Icon sx={{ fontSize: size, color, ...sx }} />;
}
