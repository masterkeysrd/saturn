import type { RouteObject } from "react-router";
import LoginPage from "./pages/LoginPage";

export const Routes: RouteObject[] = [
  {
    path: "/login",
    element: <LoginPage />,
  },
];
