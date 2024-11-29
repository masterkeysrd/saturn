import { RouteObject } from "react-router";
import Dashboard from "./Dashboard";
import RouteGuard from "../../lib/auth/RouteGuard";

const DashboardRoutes: RouteObject = {
  path: "dashboard",
  element: (
    <RouteGuard>
      <Dashboard />
    </RouteGuard>
  ),
};

export default DashboardRoutes;
