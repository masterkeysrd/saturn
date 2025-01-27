import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";

export interface MenuItem {
  key?: string;
  title: string;
  icon: React.ReactNode;
  path: string;
  children?: React.ReactNode;
}

export const MenuItem = ({ key, title, icon, path }: MenuItem) => {
  return (
    <ListItem key={key} disablePadding sx={{ display: "block", height: 48 }}>
      <ListItemButton href={path} sx={{ height: "100%" }}>
        <ListItemIcon sx={{ minWidth: 40 }}>{icon}</ListItemIcon>
        <ListItemText primary={title} sx={{ fontSize: 14 }} />
      </ListItemButton>
    </ListItem>
  );
};

export default MenuItem;
