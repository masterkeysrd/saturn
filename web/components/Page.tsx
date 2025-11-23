import { styled } from "@mui/material";
import Box from "@mui/material/Box";

interface PageProps {
    children: React.ReactNode;
}

const Container = styled(Box)(({ theme }) => ({
    display: "flex",
    flex: 1,
    flexDirection: "column",
    padding: theme.spacing(2),
    width: "100%",
    height: "100%",
}));

export default function Page({ children }: PageProps) {
    return <Container>{children}</Container>;
}
