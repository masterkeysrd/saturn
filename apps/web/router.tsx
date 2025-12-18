import { createBrowserRouter } from "react-router";
import { Routes as FeatureRoutes, Menus as FeatureMenus } from "./features";
import Root from "@/layout/Root";
import AuthProvider from "./features/auth/Auth.provider";
import { AuthRoutes } from "./features/auth";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AuthProvider>
        <Root mainMenus={FeatureMenus} />
      </AuthProvider>
    ),
    children: [...FeatureRoutes],
  },
  ...AuthRoutes,
]);

export default router;
