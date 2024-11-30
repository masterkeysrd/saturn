import { createContext, useContext, useEffect, useState } from "react";
import { CognitoUserSession } from "amazon-cognito-identity-js";
import AuthService, { UserProfile } from "./service";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  session: CognitoUserSession | null;
  profile: UserProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  isLoading: true,
  isAuthenticated: false,
  session: null,
  profile: null,
  signIn: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<CognitoUserSession | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const fetchSession = async () => {
    try {
      const [session, profile] = await AuthService.session();
      setSession(session);
      setUserProfile(profile);
    } catch (error) {
      console.error("Error fetching session", error);
      setSession(null);
    }
  };

  useEffect(() => {
    fetchSession().finally(() => setLoading(false));
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      await AuthService.signIn(email, password);
      fetchSession();
    } catch (error) {
      console.error("Error signing in", error);
      setSession(null);
    }
  };

  const logout = async () => {
    try {
      await AuthService.signOut();
      setSession(null);
      setUserProfile(null);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  const contextValue = {
    isAuthenticated: !!session && !!userProfile,
    isLoading: loading,
    session,
    profile: userProfile,
    signIn,
    logout,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
};
