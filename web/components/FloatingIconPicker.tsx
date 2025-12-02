import {
  bindPopover,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import type { IconPickerProps } from "./IconPicker";
import { Box, IconButton, Popover } from "@mui/material";
import IconPicker from "./IconPicker";
import { SelectedIcon } from "./SelectedIcon";

export type FloatingIconPickerProps = IconPickerProps;

export default function FloatingIconPicker({
  value,
  onChange,
}: FloatingIconPickerProps) {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "icon-picker",
  });

  const handleSelect = (color: string) => {
    onChange?.(color);
    popupState.close();
  };

  return (
    <>
      {/* Trigger button */}
      <IconButton
        {...bindTrigger(popupState)}
        disableRipple
        sx={{
          p: 0.5,
          borderRadius: 0,
          width: "100%",
          height: "100%",
          backgroundColor: value,
          "&:hover": {
            borderColor: (theme) => theme.palette.text.primary,
          },
        }}
      >
        <SelectedIcon name={value} />
      </IconButton>

      {/* Popover with IconPicker */}
      <Popover
        {...bindPopover(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "left",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left",
        }}
        sx={{ mt: 1 }}
      >
        <Box sx={{ p: 1.5, width: 264, height: 300 }}>
          <IconPicker
            value={value}
            onChange={handleSelect} // IMPORTANT: make sure your IconPicker exposes this
          />
        </Box>
      </Popover>
    </>
  );
}
