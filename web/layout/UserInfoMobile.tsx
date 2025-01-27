import Avatar from "@mui/material/Avatar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useAuth } from "../lib/auth/AuthContext";

export default function UserInfoMobile() {
  const { profile } = useAuth();

  if (!profile) {
    return <></>;
  }

  const name = `${profile.firstName} ${profile.lastName}`;

  return (
    <Stack
      direction="row"
      sx={{ gap: 1, alignItems: "center", flexGrow: 1, p: 1 }}
    >
      <Avatar
        sizes="small"
        alt={name}
        sx={{ width: 24, height: 24, bgcolor: "primary.main" }}
      />
      <Typography component="p" variant="h6">
        {name}
      </Typography>
    </Stack>
  );
}
