import { styled } from "@mui/material";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";

interface PageProps {
  children: React.ReactNode;
}

const Root = styled(Container)(({ theme }) => ({}));

export default function Page({ children }: PageProps) {
  return (
    <Root sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Stack sx={{ flex: 1, my: 2 }} spacing={2}>
        {children}
      </Stack>
    </Root>
  );
}
