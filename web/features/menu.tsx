import type { MenuListItem } from "../layout/MenuContent";
import { Menu as DashboardMenu } from './dashboard';

export const MenuItems: MenuListItem[] = [
    ...DashboardMenu,
];
