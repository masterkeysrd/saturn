import { RouteObject } from "react-router";
import Budget from "./Budget";
import BudgetUpdate from "./BudgetUpdate";

const BudgetRoutes: RouteObject = {
  path: "budget",
  element: <Budget />,
  children: [
    {
      path: "new",
      element: <BudgetUpdate />,
    },
    {
      path: ":id",
      element: <BudgetUpdate />,
    },
  ],
};

export default BudgetRoutes;
