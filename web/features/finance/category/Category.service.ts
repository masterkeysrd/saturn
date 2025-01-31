import axios from "axios";
import { Category } from "./Category.model";

const baseUrl = "http://localhost:3000/categorys";

export async function getCategories(): Promise<Category[]> {
  const response = await axios.get<Category[]>(baseUrl);
  return response.data;
}

export async function getCategory(id: string): Promise<Category> {
  const response = await axios.get<Category>(`${baseUrl}/${id}`);
  return response.data;
}

export async function createCategory(category: Category): Promise<Category> {
  const response = await axios.post<Category>(baseUrl, category);
  return response.data;
}

export async function updateCategory(category: Category): Promise<Category> {
  const response = await axios.put<Category>(
    `${baseUrl}/${category.id}`,
    category,
  );
  return response.data;
}
