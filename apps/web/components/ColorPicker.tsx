import { Box, Stack, styled, Tooltip, Typography } from "@mui/material";

const SIZE = 32;

export const COLORS = [
  { name: "red", value: "#f44336", label: "Red" },
  { name: "pink", value: "#e91e63", label: "Pink" },
  { name: "purple", value: "#9c27b0", label: "Purple" },
  { name: "deep-purple", value: "#673ab7", label: "Deep Purple" },
  { name: "indigo", value: "#3f51b5", label: "Indigo" },
  { name: "blue", value: "#2196f3", label: "Blue" },
  { name: "light-blue", value: "#03a9f4", label: "Light Blue" },
  { name: "cyan", value: "#00bcd4", label: "Cyan" },
  { name: "teal", value: "#009688", label: "Teal" },
  { name: "green", value: "#4caf50", label: "Green" },
  { name: "light-green", value: "#8bc34a", label: "Light Green" },
  { name: "lime", value: "#cddc39", label: "Lime" },
  { name: "yellow", value: "#ffeb3b", label: "Yellow" },
  { name: "amber", value: "#ffc107", label: "Amber" },
  { name: "orange", value: "#ff9800", label: "Orange" },
  { name: "deep-orange", value: "#ff5722", label: "Deep Orange" },
  { name: "brown", value: "#795548", label: "Brown" },
  { name: "blue-grey", value: "#607d8b", label: "Blue Grey" },
] as const;

export interface ColorPickerProps {
  value?: string;
  onChange?: (color: string) => void;
}

const Action = styled(Box, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  height: SIZE,
  width: SIZE,
  borderRadius: theme.shape.borderRadius,
  cursor: "pointer",
  boxSizing: "border-box",
  overflow: "hidden", // 👈 Very important

  transition: theme.transitions.easing.easeIn,
  outline: selected ? `2px solid ${theme.palette.text.primary}` : "none",
  outlineOffset: 2,

  "&:hover": {
    outline: `2px solid ${theme.palette.text.primary}`,
    outlineOffset: 2,
  },

  "&:active": {
    transform: "scale(0.96)",
  },

  "&:focus-visible": {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
}));

const Tile = styled(Box)({
  width: "100%",
  height: "100%",
});

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="subtitle2" color="textSecondary">
        Pick a color
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={1}>
        {COLORS.map((color) => (
          <Tooltip key={color.name} title={color.label} enterDelay={500}>
            <Action
              selected={color.value === value}
              role="button"
              tabIndex={0}
              onClick={() => onChange?.(color.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange?.(color.value);
                }
              }}
            >
              <Tile sx={{ backgroundColor: color.value }}></Tile>
            </Action>
          </Tooltip>
        ))}
      </Stack>
    </Box>
  );
}
