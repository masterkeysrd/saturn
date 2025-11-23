import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import AppNavbar from "./AppNavbar";
import Header from "./Header";
import SideMenu from "./SideMenu";
import type { Menu } from "./MenuContent";
import { Outlet } from "react-router";

interface RootProps {
    mainMenus: Menu[];
}

export default function Root({ mainMenus }: RootProps) {
    return (
        <Box sx={{ display: "flex" }}>
            <SideMenu mainMenus={mainMenus} />
            <AppNavbar mainMenus={mainMenus} />
            {/* Main content */}
            <Box
                component="main"
                sx={{
                    flexGrow: 1,
                    overflow: "auto",
                }}
            >
                <Stack
                    sx={{
                        alignItems: "center",
                    }}
                >
                    <Header />
                    <Outlet />
                </Stack>
            </Box>
        </Box>
    );
}
