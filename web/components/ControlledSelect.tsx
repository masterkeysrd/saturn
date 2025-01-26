import { Control, Controller } from "react-hook-form";
import { FormControl, Select, Typography } from "@mui/material";

export interface ControlledSelectProps {
  name: string;
  label?: string;
  defaultValue?: unknown;
  control: Control;
  rules?: Record<string, unknown>;
  children?: React.ReactNode;
}

export const ControlledSelect = ({
  name,
  label,
  defaultValue,
  control,
  rules,
  children,
}: ControlledSelectProps) => {
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
          <Select {...field} defaultValue={defaultValue}>
            {children}
          </Select>
        )}
      />
    </FormControl>
  );
};
