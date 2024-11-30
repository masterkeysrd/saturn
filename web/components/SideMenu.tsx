import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import MuiDrawer, { drawerClasses } from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import SideMenuContent from "./SideMenuContent";
import UserInfo from "./UserInfo";

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
      <UserInfo />
    </Drawer>
  );
}
