import { styled } from "@mui/material/styles";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import MuiDrawer, { drawerClasses } from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import SideMenuContent from "./SideMenuContent";
import UserMenu from "./UserMenu";

const DRAWER_WIDTH = 240;

const Drawer = styled(MuiDrawer)({
  width: DRAWER_WIDTH,
  flexShrink: 0,
  boxSizing: "border-box",
  mt: 10,
  [`& ${drawerClasses.paper}`]: {
    width: DRAWER_WIDTH,
    boxSizing: "border-box",
  },
});

export default function SideMenu() {
  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: "none", sm: "block" },
        [`& .${drawerClasses.paper}`]: {
          backgroundColor: "background.paper",
          width: DRAWER_WIDTH,
        },
      }}
    >
      <Box sx={{ display: "flex", mt: 1, p: 1.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 500 }}>
          Saturn
        </Typography>
      </Box>
      <Divider />
      <SideMenuContent />
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
        <Avatar sizes="small" alt="User" sx={{ width: 36, height: 36 }} />
        <Box sx={{ mr: "auto" }}>
          <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1 }}>
            John Doe
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            john@doe.com
          </Typography>
        </Box>
        <UserMenu />
      </Stack>
    </Drawer>
  );
}
