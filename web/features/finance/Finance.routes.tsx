import type { RouteObject } from "react-router";
import Insights from "./Insights";

export const Routes: RouteObject = {
    path: '/finance',
    children: [
        {
            path: 'insights',
            element: <Insights />
        }
    ],
};
