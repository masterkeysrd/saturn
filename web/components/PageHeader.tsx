import { styled } from "@mui/material";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface PageHeaderProps {
    title: string;
    subtitle?: string;
}

const Root = styled(Box)(({ theme }) => ({
    marginBottom: theme.spacing(3),
}));

const Title = styled(Typography)(({ theme }) => ({
    ...theme.typography.h4,
    fontWeight: 600,
}));

const Subtitle = styled(Typography)(({ theme }) => ({
    ...theme.typography.body2,
    color: theme.palette.text.secondary,
}));

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
    return (
        <Root>
            <Stack>
                <Title variant="h4">{title}</Title>
                {subtitle && <Subtitle variant="body2">{subtitle}</Subtitle>}
            </Stack>
        </Root>
    );
}
