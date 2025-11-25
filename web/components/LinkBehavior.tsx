import { forwardRef } from "react";
import {
  Link as RouterLink,
  type LinkProps as RouterLinkProps,
} from "react-router";

const LinkBehavior = forwardRef<
  HTMLAnchorElement,
  Omit<RouterLinkProps, "to"> & { href: RouterLinkProps["to"] }
>((props, ref) => {
  const { href, ...other } = props;
  return <RouterLink ref={ref} to={href} {...other} />;
});

export default LinkBehavior;
