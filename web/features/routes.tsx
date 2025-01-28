import { Navigate, RouteObject } from "react-router";

import RootLayout from "../layout/RootLayout";
import RouteGuard from "../lib/auth/RouteGuard";

import AuthRoutes from "./auth/routes";
import DashboardRoutes from "./dashboard/routes";
import { BudgetRoutes } from "./budget";
import { IncomeRoutes } from "./income";
import { ExpenseRoutes } from "./expense";

const Routes: RouteObject[] = [
  AuthRoutes,
  {
    path: "/",
    element: (
      <RouteGuard>
        <RootLayout />
      </RouteGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" /> },
      DashboardRoutes,
      BudgetRoutes,
      IncomeRoutes,
      ExpenseRoutes,
    ],
  },
];

export default Routes;
