import { Box, Stack, TextField, Typography, styled } from "@mui/material";

import { useState } from "react";
import { FLAT_ICON_LIST, ICON_SECTIONS } from "./iconData";

const Action = styled(Box, {
  shouldForwardProp: (prop) => prop !== "selected",
})<{ selected?: boolean }>(({ theme, selected }) => ({
  display: "flex",
  height: 32,
  width: 32,
  borderRadius: theme.shape.borderRadius,
  cursor: "pointer",
  boxSizing: "border-box",
  overflow: "hidden", // 👈 Very important
  alignItems: "center",
  justifyContent: "center",

  transition: theme.transitions.easing.easeIn,
  outline: selected ? `2px solid ${theme.palette.text.primary}` : "none",
  outlineOffset: 2,

  "&:hover": {
    backgroundColor: theme.palette.action.hover,
  },

  "&:active": {
    transform: "scale(0.96)",
  },

  "&:focus-visible": {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: 2,
  },
}));

export interface IconPickerProps {
  value: string | null;
  onChange: (iconName: string) => void;
  size?: number;
}

export default function IconPicker({
  value,
  onChange,
  size = 28,
}: IconPickerProps) {
  const [query, setQuery] = useState("");

  const results =
    query.length > 0
      ? FLAT_ICON_LIST.filter((i) => i.searchable.includes(query.toLowerCase()))
      : null;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Sticky search bar */}
      <Box
        sx={{
          position: "sticky",
          top: 0,
          backgroundColor: "background.paper",
          pb: 1,
          zIndex: 20,
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Search icon..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ mb: 2 }}
        />
      </Box>
      <Box sx={{ overflowY: "auto", flex: 1, pr: 1 }}>
        {/* Search results */}
        {results && results.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {results.map((item) => (
              <Action
                key={item.name}
                selected={value == item.name}
                onClick={() => onChange(item.name)}
              >
                <item.Icon color="action" sx={{ fontSize: size }} />
              </Action>
            ))}
          </Stack>
        )}

        {/* No result */}
        {results && results.length === 0 && (
          <Typography sx={{ opacity: 0.7, fontStyle: "italic" }}>
            No matching icons
          </Typography>
        )}

        {/* No search → grouped sections */}
        {!results &&
          ICON_SECTIONS.map((section) => (
            <Box key={section.group} sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {section.group}
              </Typography>

              <Stack direction="row" flexWrap="wrap" gap={1}>
                {section.items.map((item) => (
                  <Action
                    key={item.name}
                    selected={value === item.name}
                    onClick={() => onChange(item.name)}
                  >
                    <item.Icon color="action" sx={{ fontSize: size }} />
                  </Action>
                ))}
              </Stack>
            </Box>
          ))}
      </Box>
    </Box>
  );
}
