import { createContext, useContext } from "react";
import { useSession } from "./hooks";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
});

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();

  const contextValue = {
    isAuthenticated: !!session,
    isLoading: loading,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};

export { AuthContext, AuthProvider, useAuth };
