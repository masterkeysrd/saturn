import Box from "@mui/material/Box";

interface PageHeaderProps {
  children: React.ReactNode;
}

export default function PageHeader({ children }: PageHeaderProps) {
  return (
    <Box
      sx={{
        mb: 2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {children}
    </Box>
  );
}
