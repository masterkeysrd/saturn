import InsightsIcon from '@mui/icons-material/Insights';
import PaidIcon from '@mui/icons-material/Paid';
import type { Menu } from '@/layout/MenuContent';

export const Menus: Menu[] = [
    {
        title: 'Finance',
        items: [
            {
                text: "Insights",
                icon: <InsightsIcon />,
                link: "/finance/insights",
            },
            {
                text: "Transactions",
                icon: <PaidIcon />,
                link: "/finance/transactions",

            }
        ]
    },
];
