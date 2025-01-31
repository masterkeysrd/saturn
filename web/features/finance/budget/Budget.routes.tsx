import { RouteObject } from "react-router";
import Budget from "./Budget";
import BudgetDetails from "./BudgetDetails";
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
      children: [
        {
          index: true,
          element: <BudgetDetails />,
        },
        {
          path: "edit",
          element: <BudgetUpdate />,
        },
      ],
    },
  ],
};

export default BudgetRoutes;
