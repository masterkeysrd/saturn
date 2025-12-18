import { Navigate } from "react-router";
import type { RouteObject } from "react-router";
import { Routes as DashboardRoutes } from "./dashboard";
import { Routes as FinanceRoutes } from "./finance";

export const Routes: RouteObject[] = [
  { index: true, element: <Navigate to="/dashboard" /> },
  DashboardRoutes,
  FinanceRoutes,
];
