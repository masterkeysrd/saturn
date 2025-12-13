import {
  bindPopover,
  bindTrigger,
  usePopupState,
} from "material-ui-popup-state/hooks";
import type { ColorPickerProps } from "./ColorPicker";
import { Box, IconButton, Popover } from "@mui/material";
import ColorPicker from "./ColorPicker";

export type FloatingColorPickerProps = ColorPickerProps;

export default function FloatingColorPicker({
  value,
  onChange,
}: FloatingColorPickerProps) {
  const popupState = usePopupState({
    variant: "popover",
    popupId: "color-picker",
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
          borderRadius: 1,
          width: "100%",
          height: "100%",
          border: "2px solid rgba(0,0,0,0.15)",
          backgroundColor: value,
          "&:hover": {
            borderColor: (theme) => theme.palette.text.primary,
          },
        }}
      />

      {/* Popover with ColorPicker */}
      <Popover
        {...bindPopover(popupState)}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        sx={{ mt: 1 }}
      >
        <Box sx={{ p: 1.5, width: 216 }}>
          <ColorPicker
            value={value}
            onChange={handleSelect} // IMPORTANT: make sure your ColorPicker exposes this
          />
        </Box>
      </Popover>
    </>
  );
}
