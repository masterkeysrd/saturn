import { useCallback } from "react";
import { useParams } from "react-router";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import DialogContentText from "@mui/material/DialogContentText";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";

import { useNotify } from "@/lib/notify";
import { useNavigateBack } from "@/lib/navigate";
import { useTransaction, useDeleteTransaction } from "../Finance.hooks";

export default function DeleteTransactionModal() {
  const { id } = useParams<{ id: string }>();
  const navigateBack = useNavigateBack();
  const notify = useNotify();

  const { data: transaction, isLoading: isLoadingData } = useTransaction(id);

  const handleClose = useCallback(() => {
    navigateBack("/finance/transactions");
  }, [navigateBack]);

  const handleDeleteSuccess = useCallback(() => {
    notify.success("Transaction deleted successfully");
    handleClose();
  }, [notify, handleClose]);

  const handleDeleteError = useCallback(() => {
    notify.error("Failed to delete transaction");
  }, [notify]);

  const deleteMutation = useDeleteTransaction({
    onSuccess: handleDeleteSuccess,
    onError: handleDeleteError,
  });

  const handleDelete = () => {
    if (id) {
      deleteMutation.mutate(id);
    }
  };

  const isPending = deleteMutation.isPending;

  if (isLoadingData && !transaction) {
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
      <DialogTitle id="delete-dialog-title">Delete Transaction?</DialogTitle>

      <DialogContent>
        <DialogContentText id="delete-dialog-description" component="div">
          <Typography variant="body1" gutterBottom>
            Are you sure you want to delete{" "}
            <strong>{transaction?.name ?? "this transaction"}</strong>?
          </Typography>

          <Typography variant="body2" color="text.secondary">
            This action cannot be undone.
          </Typography>

          {/* DDD Context: Inform user about side effects */}
          {transaction?.type === "expense" && (
            <Alert severity="info" sx={{ mt: 2 }}>
              The amount ({transaction.amount?.currency}{" "}
              {transaction.amount?.cents ? transaction.amount.cents / 100 : 0})
              will be returned to the budget.
            </Alert>
          )}
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
