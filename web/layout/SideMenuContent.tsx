import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

import FeaturesMenu from "../features/Menu";

const secondaryListItems = [
  { title: "Profile", icon: <PersonRoundedIcon />, path: "/profile" },
  { title: "Settings", icon: <SettingsRoundedIcon />, path: "/settings" },
];

export default function MenuContent() {
  return (
    <Stack sx={{ flexGrow: 1, px: 1, justifyContent: "space-between" }}>
      <List dense sx={{ p: 0 }}>
        <FeaturesMenu />
      </List>

      <List dense>
        {secondaryListItems.map((item, index) => (
          <ListItem key={index} disablePadding sx={{ display: "block" }}>
            <ListItemButton href={item.path}>
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.title} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Stack>
  );
}
