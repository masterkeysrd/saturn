import { RouteObject } from "react-router";
import Expense from "./Expense";
import ExpenseDetails from "./ExpenseDetails";
import ExpenseUpdate from "./ExpenseUpdate";

const Routes: RouteObject = {
  path: "expense",
  element: <Expense />,
  children: [
    {
      path: "new",
      element: <ExpenseUpdate />,
    },
    {
      path: ":id",
      children: [
        {
          index: true,
          element: <ExpenseDetails />,
        },
        {
          path: "edit",
          element: <ExpenseUpdate />,
        },
      ],
    },
  ],
};

export default Routes;
