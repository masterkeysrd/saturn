import { RouteObject } from "react-router";
import { AuthRoutes } from "./auth";
import DashboardRoutes from "./dashboard/routes";

const FeatureRoutes: RouteObject[] = [AuthRoutes, DashboardRoutes];

export default FeatureRoutes;
