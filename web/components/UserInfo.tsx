import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import UserMenu from "./UserMenu";
import { useAuth } from "../lib/auth/AuthContext";

export default function UserInfo() {
  const { profile } = useAuth();

  if (!profile) {
    return <></>;
  }

  const name = `${profile.firstName} ${profile.lastName}`;

  return (
    <Stack
      direction="row"
      sx={{
        p: 2,
        gap: 1,
        alignItems: "center",
        borderTop: "1px solid",
        borderColor: "divider",
      }}
    >
      <Avatar
        sizes="small"
        alt={name}
        sx={{ width: 36, height: 36, bgcolor: "primary.main" }}
      />
      <Box sx={{ mr: "auto", maxWidth: 132 }}>
        <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1 }}>
          {name}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: 200,
            display: "block",
          }}
        >
          {profile.email}
        </Typography>
      </Box>
      <UserMenu />
    </Stack>
  );
}
