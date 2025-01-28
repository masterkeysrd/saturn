import { Control, Controller } from "react-hook-form";
import RadioGroup from "@mui/material/RadioGroup";
import { FormControl, Typography } from "@mui/material";

export interface RadioGroupProps {
  label?: string;
  name: string;
  defaultValue?: unknown;
  row?: boolean;
  control: Control;
  rules?: Record<string, unknown>;
  children: React.ReactNode;
}

export const FormRadioGroup = ({
  label,
  name,
  defaultValue,
  row,
  control,
  rules,
  children,
}: RadioGroupProps) => {
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
          <RadioGroup {...field} row={row} defaultValue={defaultValue}>
            {children}
          </RadioGroup>
        )}
      />
    </FormControl>
  );
};

export default FormRadioGroup;
