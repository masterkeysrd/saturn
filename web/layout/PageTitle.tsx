import Typography from "@mui/material/Typography";

export interface PageTitleProps {
  children?: React.ReactNode;
}

export default function PageTitle({ children }: PageTitleProps) {
  return (
    <Typography component="h2" variant="h5" sx={{ mb: 2 }}>
      {children}
    </Typography>
  );
}
