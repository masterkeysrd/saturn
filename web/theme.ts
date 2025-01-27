import { createTheme } from "@mui/material";
import { LinkProps } from "@mui/material/Link";
import LinkBehavior from "./layout/LinkBehavior";

const theme = createTheme({
  cssVariables: true,
  palette: {
    background: {
      default: "#fcfcfc",
    },
  },
  components: {
    MuiLink: {
      defaultProps: {
        component: LinkBehavior,
      } as LinkProps,
    },
    MuiButtonBase: {
      defaultProps: {
        LinkComponent: LinkBehavior,
      },
    },
  },
});

export default theme;
