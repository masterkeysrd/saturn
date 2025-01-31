import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import CategoryIcon from "@mui/icons-material/Category";
import MoneyOffRoundedIcon from "@mui/icons-material/MoneyOffRounded";

import MenuHeader from "../../layout/MenuHeader";
import MenuItem from "../../layout/MenuItem";

const Menu = () => {
  return (
    <>
      <MenuHeader>Finance</MenuHeader>
      <MenuItem
        title="Budgets"
        icon={<AccountBalanceWalletRoundedIcon />}
        path="/finance/budget"
      />
      <MenuItem
        title="Categories"
        icon={<CategoryIcon />}
        path="/finance/category"
      />
      <MenuItem
        title="Incomes"
        icon={<AttachMoneyIcon />}
        path="/finance/income"
      />
      <MenuItem
        title="Expenses"
        icon={<MoneyOffRoundedIcon />}
        path="/finance/expense"
      />
    </>
  );
};

export default Menu;
