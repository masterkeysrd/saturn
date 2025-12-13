import { useCallback } from "react";
import { useParams } from "react-router";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DialogContentText from "@mui/material/DialogContentText";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

import { useNotify } from "@/lib/notify";
import { useNavigateBack } from "@/lib/navigate";
import { useBudget, useDeleteBudget } from "../Finance.hooks";

export default function DeleteBudgetModal() {
  const { id } = useParams<{ id: string }>();
  const navigateBack = useNavigateBack();
  const notify = useNotify();

  const { data: budget, isLoading: isLoadingData } = useBudget(id);

  const handleClose = useCallback(() => {
    navigateBack("/finance/budgets");
  }, [navigateBack]);

  const handleDeleteSuccess = useCallback(() => {
    notify.success("Budget deleted successfully");
    handleClose();
  }, [notify, handleClose]);

  const handleDeleteError = useCallback(() => {
    notify.error("Failed to delete budget");
  }, [notify]);

  const deleteMutation = useDeleteBudget({
    onSuccess: handleDeleteSuccess,
    onError: handleDeleteError,
  });

  const handleDelete = () => {
    if (id) {
      deleteMutation.mutate(id);
    }
  };

  const isPending = deleteMutation.isPending;

  if (isLoadingData && !budget) {
    return null;
  }

  return (
    <Dialog
      open={true}
      onClose={handleClose}
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle id="delete-dialog-title">Delete Budget?</DialogTitle>

      <DialogContent>
        <DialogContentText id="delete-dialog-description" component="div">
          <Typography variant="body1" gutterBottom>
            Are you sure you want to delete{" "}
            <strong>{budget?.name ?? "this budget"}</strong>?
          </Typography>

          <Typography variant="body2" color="text.secondary">
            This action cannot be undone.
          </Typography>
        </DialogContentText>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={isPending} color="inherit">
          Cancel
        </Button>
        <Button
          onClick={handleDelete}
          loading={isPending}
          variant="contained"
          color="error"
          autoFocus
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
