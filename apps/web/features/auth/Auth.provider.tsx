import { useLocation, useNavigate } from "react-router";
import { useEffect } from "react";
import { isAuthenticated, isPublicPath, useUser } from "./Auth.hooks";
import { clearAuthTokens } from "@saturn/sdk/client";

interface AuthProviderProps {
  children: React.ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const authenticated = isAuthenticated();
  const { isLoading, isError } = useUser(authenticated);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    const shouldRedirectToLogin =
      (!authenticated || isError) && !isPublicPath(location.pathname);

    if (shouldRedirectToLogin) {
      const returnUrl = encodeURIComponent(
        `${location.pathname}${location.search}${location.hash}`,
      );
      clearAuthTokens();
      navigate(`/login?returnUrl=${returnUrl}`, { replace: true });
    }
  }, [
    authenticated,
    location.pathname,
    location.search,
    location.hash,
    isError,
    navigate,
    isLoading,
  ]);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return <>{children}</>;
}
