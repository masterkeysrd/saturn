import DashboardIcon from '@mui/icons-material/Dashboard';
import type { Menu } from '../../layout/MenuContent';

export const Menus: Menu[] = [
    {
        title: 'Dashboard',
        items: [
            {
                text: "Dashboard",
                icon: <DashboardIcon />,
                link: "/dashboard",
            }
        ]
    },
];
