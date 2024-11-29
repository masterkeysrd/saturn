import { styled } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MuiCard from "@mui/material/Card";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useLocation, useNavigate } from "react-router";
import {
  ConfirmSignUpState,
  SignUpState,
  useConfirmSignUp,
} from "../../lib/auth/hooks";
import { useState } from "react";
import { Alert } from "@mui/material";

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

export default function ConfirmSignUp() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [signUpState, setSignUpState] = useState<ConfirmSignUpState | null>(
    null,
  );

  const { username, message } = (state as SignUpState) || {};

  const { confirmSignUp } = useConfirmSignUp({
    onSuccess: (state: ConfirmSignUpState) => setSignUpState(state),
    onFailure: (state: ConfirmSignUpState) => setSignUpState(state),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = formData.get("username") as string;
    const code = formData.get("code") as string;
    confirmSignUp(username, code);
  };

  const handleSignIn = () => {
    navigate("/sign-in");
  };

  if (signUpState && signUpState.success) {
    return (
      <Container justifyContent="center" alignItems="center">
        <Card>
          <Typography variant="h4">You're all set!</Typography>
          <Typography variant="body1">{signUpState.message}</Typography>
          <Button onClick={handleSignIn} variant="contained">
            Sign In
          </Button>
        </Card>
      </Container>
    );
  }

  return (
    <Container justifyContent="center" alignItems="center">
      <Card>
        <Typography variant="h4">Thank you for signing up!</Typography>
        <Typography variant="body1">{message}</Typography>
        <Box
          component="form"
          onSubmit={handleSubmit}
          noValidate
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            width: "100%",
          }}
        >
          {!username && (
            <FormControl>
              <FormLabel htmlFor="username">Email</FormLabel>
              <TextField
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                fullWidth
                defaultValue={username}
              />
            </FormControl>
          )}
          {!!username && (
            <input type="hidden" name="username" value={username} />
          )}
          <FormControl>
            <FormLabel htmlFor="code">Confirmation Code</FormLabel>
            <TextField
              id="code"
              name="code"
              type="text"
              autoComplete="code"
              required
              fullWidth
            />
          </FormControl>
          {signUpState && !signUpState.success && (
            <Alert severity="error">{signUpState.message}</Alert>
          )}
          <Button type="submit" fullWidth variant="contained">
            Continue
          </Button>
          <Button fullWidth>Resend code</Button>
        </Box>
      </Card>
    </Container>
  );
}
