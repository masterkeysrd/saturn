import Divider from "@mui/material/Divider";

import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import MoneyOffRoundedIcon from "@mui/icons-material/MoneyOffRounded";

import MenuItem from "../layout/MenuItem";
import MenuHeader from "../layout/MenuHeader";

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

      <MenuHeader>Finance</MenuHeader>
      <MenuItem
        title="Budget"
        icon={<AccountBalanceWalletRoundedIcon />}
        path="/budget"
      />
      <MenuItem title="Income" icon={<AttachMoneyIcon />} path="/income" />
      <MenuItem
        title="Expense"
        icon={<MoneyOffRoundedIcon />}
        path="/expense"
      />
    </>
  );
};

export default Menu;
