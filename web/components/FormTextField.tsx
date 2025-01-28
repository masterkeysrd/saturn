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
    const errorMessage = (): string | undefined => {
      if (error?.type === "required") {
        return error.message;
      }
      if (error?.type === "min") {
        return `${label} must be greater than or equal to ${min}`;
      }
    };

    return (
      <FormControl fullWidth>
        {label && (
          <Typography
            variant="subtitle1"
            component="label"
            htmlFor={props.name}
            sx={{ mb: 0.5 }}
          >
            {label}
          </Typography>
        )}
        <TextField
          {...props}
          ref={ref}
          error={!!error}
          helperText={errorMessage()}
        />
      </FormControl>
    );
  },
);

export default FormTextField;
