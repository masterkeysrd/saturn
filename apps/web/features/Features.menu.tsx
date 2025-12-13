import type { Menu } from "@/layout/MenuContent";
import { Menus as DashboardMenu } from './dashboard';
import { Menus as FinanceMenu } from './finance';

export const Menus: Menu[] = [
    ...DashboardMenu,
    ...FinanceMenu,
];
