import { RouteObject } from "react-router";
import Expense from "./Expense";
import ExpenseUpdate from "./ExpenseUpdate";

const ExpenseRoutes: RouteObject = {
  path: "expense",
  element: <Expense />,
  children: [
    {
      path: "new",
      element: <ExpenseUpdate />,
    },
    {
      path: ":id",
      element: <ExpenseUpdate />,
    },
  ],
};

export default ExpenseRoutes;
