import { Control, Controller, FieldError } from "react-hook-form";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";

export interface FormSelectProps {
  name: string;
  label?: string;
  defaultValue?: unknown;
  control: Control;
  rules?: Record<string, unknown>;
  error?: FieldError;
  children?: React.ReactNode;
}

export const FormSelect = ({
  name,
  label,
  defaultValue,
  control,
  rules,
  error,
  children,
}: FormSelectProps) => {
  return (
    <FormControl fullWidth>
      {label && (
        <Typography
          variant="subtitle1"
          component="label"
          htmlFor={name}
          sx={{ mb: 0.5 }}
        >
          {label}
        </Typography>
      )}

      <Controller
        name={name}
        control={control}
        rules={rules}
        render={({ field }) => (
          <>
            <Select {...field} defaultValue={defaultValue} error={!!error}>
              {children}
            </Select>
          </>
        )}
      />
      {error && (
        <FormHelperText sx={{ color: (theme) => theme.palette.error.main }}>
          {error.message}
        </FormHelperText>
      )}
    </FormControl>
  );
};

export default FormSelect;
