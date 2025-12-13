import { useNavigate } from "react-router";

/**
 * Custom hook for navigating back with a fallback path
 *
 * @returns Function to navigate back or to fallback
 *
 * @example
 * const navigateBack = useNavigateBack();
 * <Button onClick={() => navigateBack('/expenses')}>Back</Button>
 */
export function useNavigateBack() {
  const navigate = useNavigate();

  /**
   * Navigate back in history or to a fallback path
   *
   * @param fallbackPath - Path to navigate to if no history exists
   */
  const navigateBack = (fallbackPath: string) => {
    // Check if there's history to go back to
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate(fallbackPath, { replace: true });
    }
  };

  return navigateBack;
}
