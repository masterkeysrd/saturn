import { createBrowserRouter } from "react-router";
import { Routes as FeatureRoutes, MenuItems as FeatureMenuItems } from "./features";
import Root from "./layout/Root";

const router = createBrowserRouter([
    {
        path: "/",
        element: <Root mainMenuItems={FeatureMenuItems}/>,
        children: [
            ...FeatureRoutes,
        ],
    }
]);

export default router;
