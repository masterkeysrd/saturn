import Box from "@mui/material/Box";

export interface PageProps {
  children: React.ReactNode;
}

export default function Page({ children }: PageProps) {
  return (
    <Box sx={{ pt: 2, width: "100%", maxWidth: { sm: "100%", md: "1700px" } }}>
      {children}
    </Box>
  );
}
