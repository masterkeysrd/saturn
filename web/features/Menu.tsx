import Divider from "@mui/material/Divider";

import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import MenuItem from "../layout/MenuItem";
import MenuHeader from "../layout/MenuHeader";
import FinanceMenu from "./finance/Menu";

export const Menu = () => {
  return (
    <>
      <MenuHeader>General</MenuHeader>
      <MenuItem
        title="Dashboard"
        icon={<DashboardRoundedIcon />}
        path="/dashboard"
      />
      <Divider sx={{ mt: 1.5 }} />

      <FinanceMenu />
    </>
  );
};

export default Menu;
