import styled from "@mui/material/styles/styled";
import MuiLink from "@mui/material/Link";
import Typography from "@mui/material/Typography";

export interface LinkProps {
  href: string;
  children: React.ReactNode;
}

export const Link = ({ href, children }: LinkProps) => {
  return (
    <MuiLink href={href} sx={{ color: "inherit", textDecoration: "none" }}>
      <Text>{children}</Text>
    </MuiLink>
  );
};

const Text = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.primary,
  fontSize: "inherit",
  fontWeight: theme.typography.fontWeightMedium,
  textDecoration: "none",
  "&:hover": {
    textDecoration: "underline",
  },
}));

export default Link;
