import { Navigate, RouteObject } from "react-router";

import RootLayout from "../components/RootLayout";
import RouteGuard from "../lib/auth/RouteGuard";

import AuthRoutes from "./auth/routes";
import DashboardRoutes from "./dashboard/routes";
import { BudgetRoutes } from "./budget";

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
    ],
  },
];

export default Routes;
