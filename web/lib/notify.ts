import { useCallback } from "react";
import { useSnackbar } from "notistack";

const SECOND = 1000;

// Define the public interface returned by the hook
export interface NotifyAPI {
  info: (message: string) => void;
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
        autoHideDuration: 3 * SECOND, // Standard hide time
      });
    },
    [enqueueSnackbar],
  );

  const info = useCallback(
    (message: string, duration = 3 * SECOND) => {
      enqueueSnackbar(message, {
        variant: "info",
        autoHideDuration: duration, // Longer duration for critical messages
      });
    },
    [enqueueSnackbar],
  );

  // Ensures error function is stable across renders
  const error = useCallback(
    (message: string, duration = 6 * SECOND) => {
      enqueueSnackbar(message, {
        variant: "error",
        autoHideDuration: duration, // Longer duration for critical messages
      });
    },
    [enqueueSnackbar],
  );

  // Return the stable API object
  return { info, success, error };
};
