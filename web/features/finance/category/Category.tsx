import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";

import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";

import AddIcon from "@mui/icons-material/Add";

import Page from "@/layout/Page";
import PageHeader from "@/layout/PageHeader";
import PageTitle from "@/layout/PageTitle";
import { CategoryType } from "./Category.model";

export const Category = () => {
  const [currentTab, setCurrentTab] = useState<CategoryType | null>(null);
  const { pathname } = useLocation();
  const buttonTitle = `Create a new ${currentTab} Category`;
  const buttonHref = `/finance/category/${currentTab}/new`;

  useEffect(() => {
    const tab = pathname.includes("income") ? "income" : "expense";
    setCurrentTab(tab);
  }, [pathname]);

  if (!currentTab) {
    return null;
  }

  return (
    <Page>
      <PageHeader>
        <PageTitle>Categories</PageTitle>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          href={buttonHref}
        >
          {buttonTitle}
        </Button>
      </PageHeader>
      <Tabs value={currentTab} onChange={(_, value) => setCurrentTab(value)}>
        <Tab
          label="Expense"
          value="expense"
          href="/finance/category/expense"
          component={Link}
        />
        <Tab
          label="Income"
          value="income"
          href="/finance/category/income"
          component={Link}
        />
      </Tabs>
      <Outlet />
    </Page>
  );
};

export default Category;
