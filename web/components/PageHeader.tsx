import { styled } from "@mui/material";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
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

export default function PageHeader({
  title,
  subtitle,
  children,
}: PageHeaderProps) {
  return (
    <Root>
      <Stack>
        <Box>
          <Title variant="h4">{title}</Title>
          {subtitle && <Subtitle variant="body2">{subtitle}</Subtitle>}
        </Box>
        {children && <Box>{children}</Box>}
      </Stack>
    </Root>
  );
}

interface PageHeaderActionsProps {
  align?: "left" | "right";
  children: React.ReactNode;
}

export function PageHeaderActions({
  children,
  align = "right",
}: PageHeaderActionsProps) {
  return (
    <Stack
      direction="row"
      spacing={1.5}
      justifyContent={align === "left" ? "flex-start" : "flex-end"}
      sx={{ width: "100%" }}
    >
      {children}
    </Stack>
  );
}

PageHeader.Actions = PageHeaderActions;
