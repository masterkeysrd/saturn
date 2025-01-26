import { Navigate, RouteObject } from "react-router";
import AuthRoutes from "./auth/routes";
import DashboardRoutes from "./dashboard/routes";
import { ExpenseRoutes } from "./expense";
import RootLayout from "../components/RootLayout";
import RouteGuard from "../lib/auth/RouteGuard";

const FeatureRoutes: RouteObject[] = [
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
      ExpenseRoutes,
    ],
  },
];

export default FeatureRoutes;
