import Dialog, { type DialogProps } from "@mui/material/Dialog";
import { useMediaQuery, useTheme } from "@mui/material";
import DialogActions, {
  type DialogActionsProps,
} from "@mui/material/DialogActions";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent, {
  type DialogContentProps,
} from "@mui/material/DialogContent";
import Stack from "@mui/material/Stack";

interface FormDialogProps extends Omit<DialogProps, "slotProps" | "onSubmit"> {
  title: string;
  children: React.ReactNode;
  onSubmit: React.FormEventHandler;
}

export default function FormDialog({
  title,
  children,
  onSubmit,
  ...rest
}: FormDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  return (
    <Dialog
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      {...rest}
      slotProps={{
        paper: {
          component: "form",
          onSubmit,
        },
      }}
    >
      <DialogTitle>{title}</DialogTitle>
      {children}
    </Dialog>
  );
}

interface FormDialogContentProps extends DialogContentProps {
  children: React.ReactNode;
}

function FormDialogContent({ children, ...rest }: FormDialogContentProps) {
  return (
    <DialogContent {...rest}>
      <Stack spacing={2} sx={{ mt: 1 }}>
        {children}
      </Stack>
    </DialogContent>
  );
}

FormDialog.Content = FormDialogContent;

interface FormDialogActionsProps extends DialogActionsProps {
  children: React.ReactNode;
}

function FormDialogActions({ children, ...rest }: FormDialogActionsProps) {
  return (
    <DialogActions
      {...rest}
      sx={{ padding: (theme) => theme.spacing(1, 2, 3) }}
    >
      {children}
    </DialogActions>
  );
}

FormDialog.Actions = FormDialogActions;
