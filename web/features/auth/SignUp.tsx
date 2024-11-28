import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Link from "@mui/material/Link";
import MuiCard from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

const Card = styled(MuiCard)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  alignSelf: "center",
  width: "100%",
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  margin: "auto",
  [theme.breakpoints.up("sm")]: {
    maxWidth: "600px",
  },
}));

const Container = styled(Stack)(({ theme }) => ({
  height: "100vh",
  mninHeight: "100%",
  padding: theme.spacing(3),
  [theme.breakpoints.up("sm")]: {
    padding: theme.spacing(4),
  },
}));

const FormRow = styled(Stack)(({ theme }) => ({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  gap: theme.spacing(2),
  [theme.breakpoints.up("sm")]: {
    flexDirection: "row",
  },
}));

export default function SignUp() {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    console.log("Form submitted");
    event.preventDefault();
  };

  return (
    <Container>
      <Card>
        <Typography component="h1" variant="h4">
          Sign up
        </Typography>
        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          sx={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            gap: 2,
          }}
        >
          <FormRow>
            <FormControl sx={{ flex: 1 }}>
              <FormLabel htmlFor="firstName">First name</FormLabel>
              <TextField
                id="firstName"
                type="text"
                name="firstName"
                placeholder="John"
                autoComplete="given-name"
                autoFocus
                required
                fullWidth
                variant="outlined"
                size="small"
              />
            </FormControl>
            <FormControl sx={{ flex: 1 }}>
              <FormLabel htmlFor="lastName">Last name</FormLabel>
              <TextField
                id="lastName"
                type="text"
                name="lastName"
                placeholder="Doe"
                autoComplete="family-name"
                autoFocus
                required
                variant="outlined"
                size="small"
              />
            </FormControl>
          </FormRow>
          <FormControl>
            <FormLabel htmlFor="email">Email</FormLabel>
            <TextField
              id="email"
              type="email"
              name="email"
              placeholder="your@email.com"
              autoComplete="email"
              autoFocus
              required
              fullWidth
              variant="outlined"
              size="small"
            />
          </FormControl>
          <FormControl>
            <FormLabel htmlFor="password">Password</FormLabel>
            <TextField
              id="password"
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="new-password"
              autoFocus
              required
              fullWidth
              variant="outlined"
              size="small"
            />
          </FormControl>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ mt: 2 }}
          >
            Sign up
          </Button>
          <Typography variant="body2" sx={{ alignSelf: "center" }}>
            Already have an account?{" "}
            <Link href="/sign-in" underline="hover">
              Sign in
            </Link>
          </Typography>
        </Box>
      </Card>
    </Container>
  );
}
