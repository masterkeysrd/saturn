import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import MoneyOffRoundedIcon from "@mui/icons-material/MoneyOffRounded";

import MenuHeader from "../../layout/MenuHeader";
import MenuItem from "../../layout/MenuItem";

const Menu = () => {
  return (
    <>
      <MenuHeader>Finance</MenuHeader>
      <MenuItem
        title="Budget"
        icon={<AccountBalanceWalletRoundedIcon />}
        path="/finance/budget"
      />
      <MenuItem
        title="Income"
        icon={<AttachMoneyIcon />}
        path="/finance/income"
      />
      <MenuItem
        title="Expense"
        icon={<MoneyOffRoundedIcon />}
        path="/finance/expense"
      />
    </>
  );
};

export default Menu;
