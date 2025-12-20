import { styled } from "@mui/material/styles";
import Avatar from "@mui/material/Avatar";
import MuiDrawer, { drawerClasses } from "@mui/material/Drawer";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MenuContent, { type Menu } from "./MenuContent";
import OptionsMenu from "./OptionsMenu";
import { useCurrentUser } from "../features/auth/Auth.hooks";
import SpaceSelector from "./SpaceSelector";

const drawerWidth = 240;

const Drawer = styled(MuiDrawer)({
  width: drawerWidth,
  flexShrink: 0,
  boxSizing: "border-box",
  mt: 10,
  [`& .${drawerClasses.paper}`]: {
    width: drawerWidth,
    boxSizing: "border-box",
  },
});

export interface SideMenuProps {
  mainMenus: Menu[];
}

export default function SideMenu({ mainMenus }: SideMenuProps) {
  const user = useCurrentUser();
  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: "none", md: "block" },
        [`& .${drawerClasses.paper}`]: {
          backgroundColor: "background.paper",
        },
      }}
    >
      <Box sx={{ px: 2, py: 1 }}>
        <SpaceSelector />
      </Box>
      <Divider />
      <Box
        sx={{
          overflow: "auto",
          height: "100%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <MenuContent mainMenus={mainMenus} />
      </Box>
      <Stack
        direction="row"
        sx={{
          p: 2,
          gap: 1,
          alignItems: "center",
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Avatar sizes="small" alt="John Doe" sx={{ width: 36, height: 36 }} />
        {user && (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              mr: "auto",
              flexGrow: 1,
              minWidth: 0,
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontWeight: 500, lineHeight: "16px" }}
            >
              {user.name}
            </Typography>
            <Typography
              variant="caption"
              noWrap
              sx={{ color: "text.secondary" }}
            >
              {user.email}
            </Typography>
          </Box>
        )}
        <OptionsMenu />
      </Stack>
    </Drawer>
  );
}
