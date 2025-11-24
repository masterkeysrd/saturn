import Box from "@mui/material/Box";
import AppNavbar from "./AppNavbar";
import Header from "./Header";
import SideMenu from "./SideMenu";
import type { Menu } from "./MenuContent";
import { Outlet } from "react-router";
import { styled } from "@mui/material";

interface RootProps {
  mainMenus: Menu[];
}

const Container = styled(Box)({
  display: "flex",
  flexDirection: "column",
  height: "100dvh",
});

export default function Root({ mainMenus }: RootProps) {
  return (
    <Container>
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <Box
          sx={{
            display: "flex",
            position: "relative",
            overflow: "hidden",
            height: "100%",
            width: "100%",
          }}
        >
          <SideMenu mainMenus={mainMenus} />
          <AppNavbar mainMenus={mainMenus} />
          {/* Main content */}
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
            }}
          >
            <Header />
            <Box
              component="main"
              sx={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                overflow: "auto",
              }}
            >
              <Outlet />
            </Box>
          </Box>
        </Box>
      </Box>
    </Container>
  );
}
