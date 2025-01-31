import { RouteObject } from "react-router";

import { BudgetRoutes } from "./budget";
import { CategoryRoutes } from "./category";
import { IncomeRoutes } from "./income";
import { ExpenseRoutes } from "./expense";

const Routes: RouteObject = {
  path: "/finance",
  children: [BudgetRoutes, IncomeRoutes, ExpenseRoutes, CategoryRoutes],
};

export default Routes;
