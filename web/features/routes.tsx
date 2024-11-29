import { RouteObject } from "react-router";
import AuthRoutes from "./auth/routes";
import DashboardRoutes from "./dashboard/routes";
import ExpenseRoutes from "./expense/routes";

const FeatureRoutes: RouteObject[] = [
  AuthRoutes,
  DashboardRoutes,
  ExpenseRoutes,
];

export default FeatureRoutes;
