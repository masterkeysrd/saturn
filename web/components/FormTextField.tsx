import { FieldError } from "react-hook-form";

import FormControl from "@mui/material/FormControl";
import TextField, { TextFieldProps } from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { forwardRef } from "react";

export type FormTextFieldProps = Omit<TextFieldProps, "error"> & {
  min?: number | string;
  error?: FieldError;
};

export const FormTextField = forwardRef<HTMLInputElement, FormTextFieldProps>(
  function FormTextField(
    { label, min, error, ...props }: FormTextFieldProps,
    ref,
  ) {
    return (
      <FormControl fullWidth>
        {label && (
          <Typography
            variant="subtitle1"
            component="label"
            htmlFor={props.name}
          >
            {label}
          </Typography>
        )}
        <TextField {...props} ref={ref} error={!!error} />
        {error?.message && (
          <Typography color="error">{error.message}</Typography>
        )}
        {error?.type === "min" && (
          <Typography color="error">
            {label} must be greater than or equal to {min}
          </Typography>
        )}
      </FormControl>
    );
  },
);

export default FormTextField;
