import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";

interface PageProps {
  children: React.ReactNode;
}

export default function Page({ children }: PageProps) {
  return (
    <Container sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
      <Stack sx={{ flex: 1, my: 2 }} spacing={2}>
        {children}
      </Stack>
    </Container>
  );
}
