import type { RouteObject } from "react-router";
import Dashboard from "./Dashboard";

export const Routes: RouteObject = {
    path: '/dashboard',
    element: <Dashboard />
};
