import { RouteObject } from "react-router";

import { BudgetRoutes } from "./budget";
import { IncomeRoutes } from "./income";
import { ExpenseRoutes } from "./expense";

const Routes: RouteObject = {
  path: "/finance",
  children: [BudgetRoutes, IncomeRoutes, ExpenseRoutes],
};

export default Routes;
