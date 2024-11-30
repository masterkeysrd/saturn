import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  console.log("RouteGuard", { isLoading, isAuthenticated });

  if (isLoading) {
    return <></>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" />;
  }

  return children;
}

export default RouteGuard;
