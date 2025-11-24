import Box from "@mui/material/Box";
import { styled } from "@mui/material/styles";

interface PageContentProps {
  children: React.ReactNode;
}

const Root = styled(Box)({});

export default function PageContent({ children }: PageContentProps) {
  return (
    <Root sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {children}
    </Root>
  );
}
