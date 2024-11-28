import React from "react";
import Box from "@mui/material/Box";
import { Outlet } from "react-router";

export default function Layout() {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        backgroundColor: (theme) => theme.palette.background.default,
      }}
    >
      <Outlet />
    </Box>
  );
}
