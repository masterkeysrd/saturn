import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  loginUser,
  logoutUser,
  getUser,
} from "@saturn/gen/saturn/identity/v1/identity.client";
import { saveAuthTokens, clearAuthTokens } from "@saturn/sdk/client";
import { localStore } from "@saturn/sdk/localstorage";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password"];

// --- Hooks ---
export const useUser = (enabled = true) => {
  return useQuery({
    queryKey: ["auth", "user"],
    queryFn: () =>
      getUser({ id: "me", $typeName: "saturn.identity.v1.GetUserRequest" }),
    retry: false,
    enabled, // Can disable if we know we have no token
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};

export const useCurrentUser = () => {
  const { data: user } = useUser();
  return user;
};

export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      saveAuthTokens({
        token: data.token,
        refreshToken: data.refreshToken,
      });

      queryClient.invalidateQueries({ queryKey: ["auth", "user"] });
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logoutUser,
    onSettled: () => {
      // Always clean up, even if server call fails
      clearAuthTokens();
      queryClient.setQueryData(["auth", "user"], null);
      queryClient.removeQueries({ queryKey: ["auth"] });
      window.location.href = "/login";
    },
  });
};

export function isAuthenticated() {
  const token = localStore.load("auth_token");
  return !!token;
}

export function isPublicPath(path: string) {
  return PUBLIC_PATHS.includes(path);
}
