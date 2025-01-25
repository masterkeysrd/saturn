import axios from "axios";

type Expense = {
  id: number;
  description: string;
  amount: number;
};

const baseUrl = "http://localhost:3000/expenses";

export async function getExpenses(): Promise<Expense[]> {
  const response = await axios.get<Expense[]>(baseUrl);
  console.log(response.data);

  return response.data;
}
