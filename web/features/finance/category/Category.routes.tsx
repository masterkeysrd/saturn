import { Navigate, RouteObject } from "react-router";

import Category from "./Category";
import CategoryTab from "./CategoryTab";
import CategoryUpdate from "./CategoryUpdate";
import { CategoryType } from "./Category.model";

const subRoutes = (["expense", "income"] as CategoryType[]).map((type) => ({
  path: type,
  element: <CategoryTab type={type} />,
  children: [
    {
      path: "new",
      element: <CategoryUpdate type={type} />,
    },
    {
      path: ":id",
      element: <CategoryUpdate type={type} />,
    },
  ],
}));

const CategoryRoutes: RouteObject = {
  path: "category",
  element: <Category />,
  children: [
    {
      index: true,
      element: <Navigate to="expense" />,
    },
    ...subRoutes,
  ],
};

export default CategoryRoutes;
