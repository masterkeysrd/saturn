import {
  Avatar,
  ListItemAvatar,
  ListItemText,
  MenuItem,
  Select,
  selectClasses,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import ConstructionRoundedIcon from "@mui/icons-material/ConstructionRounded";
import {
  useSpaces,
  useSpaceSelection,
} from "../features/tenancy/Tenancy.hooks";

export default function SpaceSelector() {
  const [space, setSpace] = useSpaceSelection();
  const { data: spaces } = useSpaces();

  const handleSpaceChange = (event: SelectChangeEvent<string>) => {
    setSpace(event.target.value);
  };

  return (
    <Select
      labelId="space-selector"
      id="space-selector"
      value={space}
      onChange={handleSpaceChange}
      displayEmpty
      fullWidth
      inputProps={{ "aria-label": "Select Space" }}
      sx={{
        maxHeight: 56,
        width: 215,
        "&.MuiList-root": {
          p: "8px",
        },
        [`& .${selectClasses.select}`]: {
          display: "flex",
          alignItems: "center",
          gap: "2px",
          pl: 1,
        },
      }}
      renderValue={(value) => {
        const displaySpace = spaces?.spaces.find((s) => s.id === value);
        if (!displaySpace) {
          return (
            <Typography
              variant="subtitle2"
              color="textSecondary"
              noWrap
              sx={{ flex: 1 }}
            >
              Select Space
            </Typography>
          );
        }
        return (
          <>
            <Avatar alt={displaySpace.name} sx={{ width: 32, height: 32 }}>
              <ConstructionRoundedIcon sx={{ fontSize: "1rem" }} />
            </Avatar>
            <Typography variant="subtitle2" noWrap sx={{ flex: 1, ml: 1 }}>
              {displaySpace.name}
            </Typography>
          </>
        );
      }}
    >
      {spaces?.spaces.map((s) => (
        <MenuItem key={s.id} value={s.id}>
          <ListItemAvatar>
            <Avatar alt={s.name} sx={{ width: 32, height: 32 }}>
              <ConstructionRoundedIcon sx={{ fontSize: "1rem" }} />
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={
              <Typography variant="subtitle2" noWrap>
                {s.name}
              </Typography>
            }
            secondary={
              <Typography variant="caption" color="textSecondary" noWrap>
                {s.description}
              </Typography>
            }
          />
        </MenuItem>
      ))}
    </Select>
  );
}
