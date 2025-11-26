import { useCallback } from "react";
import { useSnackbar } from "notistack";

// Define the public interface returned by the hook
export interface NotifyAPI {
  success: (message: string) => void;
  error: (message: string, duration?: number) => void;
  // You could also add info, warning, etc.
}

/**
 * Custom hook to provide a simplified, standardized interface for notifications.
 * It encapsulates the 'notistack' dependency.
 */
export const useNotify = (): NotifyAPI => {
  const { enqueueSnackbar } = useSnackbar();

  // Ensures success function is stable across renders
  const success = useCallback(
    (message: string) => {
      enqueueSnackbar(message, {
        variant: "success",
        autoHideDuration: 3000, // Standard hide time
      });
    },
    [enqueueSnackbar],
  );

  // Ensures error function is stable across renders
  const error = useCallback(
    (message: string, duration = 6000) => {
      enqueueSnackbar(message, {
        variant: "error",
        autoHideDuration: duration, // Longer duration for critical messages
      });
    },
    [enqueueSnackbar],
  );

  // Return the stable API object
  return { success, error };
};
