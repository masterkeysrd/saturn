import { RouteObject } from "react-router";
import Expense from "./Expense";

const Routes: RouteObject = {
  path: "expense",
  element: <Expense />,
  children: [],
};

export default Routes;
