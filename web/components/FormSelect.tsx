import { Control, Controller } from "react-hook-form";
import { FormControl, Select, Typography } from "@mui/material";

export interface FormSelectProps {
  name: string;
  label?: string;
  defaultValue?: unknown;
  control: Control;
  rules?: Record<string, unknown>;
  error?: string;
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
        <Typography variant="subtitle1" component="label" htmlFor={name}>
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
            {error && <Typography color="error">{error}</Typography>}
          </>
        )}
      />
    </FormControl>
  );
};

export default FormSelect;
