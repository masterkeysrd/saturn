import React from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Link from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useSignIn } from "../../lib/auth/hooks";
import { CognitoUserSession } from "amazon-cognito-identity-js";

export default function SignIn() {
  const { signIn } = useSignIn({
    onSuccess: (session: CognitoUserSession) => handleSignInSuccess(session),
    onFailure: (error: Error) => handleSignInFailure(error),
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!event.currentTarget.checkValidity()) {
      if (event.currentTarget.reportValidity) {
        event.currentTarget.reportValidity();
      }
      return;
    }

    const formData = new FormData(event.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    signIn(email, password);
  };

  const handleSignInSuccess = (session: CognitoUserSession) => {
    // Redirect to the dashboard
    console.log("Sign in success", session);
  };

  const handleSignInFailure = (error: Error) => {
    // Display an error message
    console.error("Sign in failure", error);
  };

  return (
    <>
      <Typography component="h1" variant="h4">
        Sign in
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
            color="primary"
          />
        </FormControl>
        <FormControl>
          <FormLabel htmlFor="password">Password</FormLabel>
          <TextField
            id="password"
            type="password"
            name="password"
            placeholder="••••••••"
            autoComplete="current-password"
            autoFocus
            required
            fullWidth
            variant="outlined"
            color="primary"
          />
        </FormControl>
        <FormControlLabel
          control={<Checkbox value="remember" color="primary" />}
          label="Remember me"
        />
        <Button type="submit" fullWidth variant="contained" size="large">
          Sign in
        </Button>
        <Link
          variant="body2"
          sx={{ alignSelf: "center" }}
          href="/forgot-password"
        >
          Forgot password?
        </Link>
        <Typography variant="body2" sx={{ alignSelf: "center" }}>
          Don't have an account?{" "}
          <Link href="/sign-up" color="primary">
            Sign up
          </Link>
        </Typography>
      </Box>
    </>
  );
}
