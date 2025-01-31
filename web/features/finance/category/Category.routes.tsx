import { RouteObject } from "react-router";

import Category from "./Category";
import CategoryUpdate from "./CategoryUpdate";

const CategoryRoutes: RouteObject = {
  path: "category",
  element: <Category />,
  children: [
    {
      path: "new",
      element: <CategoryUpdate />,
    },
    {
      path: ":id",
      children: [
        {
          path: "edit",
          element: <CategoryUpdate />,
        },
      ],
    },
  ],
};

export default CategoryRoutes;
