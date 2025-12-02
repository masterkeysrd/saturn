import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import { FLAT_ICON_LIST } from "./iconData";

interface SelectedIconProps {
  name: string | null;
  size?: number;
  color?: string;
}

export function SelectedIcon({ name, size = 28, color }: SelectedIconProps) {
  if (!name) return null;

  const icon = FLAT_ICON_LIST.find((i) => i.name === name);

  if (!icon) {
    return <HelpOutlineIcon sx={{ fontSize: size }} />;
  }

  const Icon = icon.Icon;

  return <Icon sx={{ fontSize: size, color }} />;
}
