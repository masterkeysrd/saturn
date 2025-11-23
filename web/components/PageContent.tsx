import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";

interface PageContentProps {
    children: React.ReactNode;
}

const Root = styled(Box)({
    width: "100%",
    margin: "0 auto",
});

export default function PageContent({ children }: PageContentProps) {
    return <Root>{children}</Root>;
}
