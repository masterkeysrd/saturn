import { Navigate, RouteObject } from "react-router";
import AuthRoutes from "./auth/routes";
import DashboardRoutes from "./dashboard/routes";
import ExpenseRoutes from "./expense/Expense.routes";
import RootLayout from "../components/RootLayout";

const FeatureRoutes: RouteObject[] = [
  AuthRoutes,
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" /> },
      DashboardRoutes,
      ExpenseRoutes,
    ],
  },
];

export default FeatureRoutes;
