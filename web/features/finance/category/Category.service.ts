import axios from "axios";
import { Category, CategoryType } from "./Category.model";

const baseUrl = "http://localhost:3000/categories";

export async function getCategories(
  categoryType: CategoryType,
): Promise<Category[]> {
  const response = await axios.get<Category[]>(`${baseUrl}/${categoryType}`);
  return response.data;
}

export async function getCategory(
  categoryType: CategoryType,
  id: string,
): Promise<Category> {
  const response = await axios.get<Category>(
    `${baseUrl}/${categoryType}/${id}`,
  );
  return response.data;
}

export async function createCategory(
  categoryType: CategoryType,
  category: Category,
): Promise<Category> {
  const response = await axios.post<Category>(
    `${baseUrl}/${categoryType}`,
    category,
  );
  return response.data;
}

export async function updateCategory(
  categoryType: CategoryType,
  category: Category,
): Promise<Category> {
  const response = await axios.put<Category>(
    `${baseUrl}/${categoryType}/${category.id}`,
    category,
  );
  return response.data;
}
