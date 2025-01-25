import { RouteObject } from "react-router";
import Expense from "./Expense";
import RouteGuard from "../../lib/auth/RouteGuard";

const ExpenseRoutes: RouteObject = {
  path: "expense",
  element: (
    <RouteGuard>
      <Expense />
    </RouteGuard>
  ),
};

export default ExpenseRoutes;
