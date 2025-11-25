import { createTheme } from "@mui/material";
import type { LinkProps } from "@mui/material/Link";
import LinkBehavior from "./components/LinkBehavior";

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
    MuiMenuItem: {
      defaultProps: {
        LinkComponent: LinkBehavior,
      },
    },
  },
});

export default theme;
