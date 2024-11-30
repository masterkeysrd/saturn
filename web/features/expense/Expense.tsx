import Page from "../../components/Page";
import PageTitle from "../../components/PageTitle";
import ExpenseList from "./components/ExpenseList";

export default function Expense() {
  return (
    <Page>
      <PageTitle>Expenses</PageTitle>
      <ExpenseList />
    </Page>
  );
}
