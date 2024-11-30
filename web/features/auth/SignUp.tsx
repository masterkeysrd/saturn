import React, { useState } from "react";
import { useNavigate } from "react-router";
import { styled } from "@mui/material/styles";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AuthService, { SignUpState } from "../../lib/auth/service";

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
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleSignUpSuccess = (state: SignUpState) => {
    navigate("/confirm-sign-up", { state });
  };

  const handleSignUpFailure = (error: Error) => {
    setError(error.message);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!event.currentTarget.checkValidity()) {
      if (event.currentTarget.reportValidity) {
        event.currentTarget.reportValidity();
      }
      setError("Please fill out all fields.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    const data = {
      firstName: formData.get("firstName") as string,
      lastName: formData.get("lastName") as string,
      email: formData.get("email") as string,
      password: formData.get("password") as string,
    };

    try {
      const result = await AuthService.signUp(data);
      handleSignUpSuccess(result);
    } catch (error: unknown) {
      handleSignUpFailure(error as Error);
    }
  };

  return (
    <>
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
        {error && <Alert severity="error">{error}</Alert>}
        <Button
          type="submit"
          variant="contained"
          color="primary"
          size="large"
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
    </>
  );
}
