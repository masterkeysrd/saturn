import { RouteObject } from "react-router";
import Expense from "./Expense";

const ExpenseRoutes: RouteObject = {
  path: "expense",
  element: <Expense />,
};

export default ExpenseRoutes;
