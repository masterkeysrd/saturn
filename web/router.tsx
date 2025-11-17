import { createBrowserRouter } from "react-router";
import { Routes as FeatureRoutes, Menus as FeatureMenus } from "./features";
import Root from "./layout/Root";

const router = createBrowserRouter([
    {
        path: "/",
        element: <Root mainMenus={FeatureMenus}/>,
        children: [
            ...FeatureRoutes,
        ],
    }
]);

export default router;
