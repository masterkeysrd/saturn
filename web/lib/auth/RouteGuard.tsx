import { Navigate } from "react-router";
import { useAuth } from "./AuthContext";

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();

  if (isLoading) {
    return <></>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return children;
}

export default RouteGuard;
