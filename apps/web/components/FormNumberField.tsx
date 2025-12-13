import * as React from "react";
import {
  TextField,
  type TextFieldProps,
  InputAdornment,
  IconButton,
  Box,
} from "@mui/material";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import {
  useController,
  type UseControllerProps,
  type FieldValues,
  type FieldPath,
} from "react-hook-form";

interface NumberFieldBaseProps {
  min?: number;
  max?: number;
  step?: number;
  decimalPlaces?: number;
  startAdornment?: React.ReactNode;
  endAdornment?: React.ReactNode;
}

export interface NumberFieldProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends Omit<UseControllerProps<TFieldValues, TName>, "render">,
    NumberFieldBaseProps,
    Omit<
      TextFieldProps,
      | "name"
      | "value"
      | "onChange"
      | "onBlur"
      | "inputRef"
      | "type"
      | "defaultValue"
      | "slotProps"
    > {}

export default function NumberField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  control,
  defaultValue,
  rules,
  shouldUnregister,
  disabled,
  min,
  max,
  step = 1,
  decimalPlaces = 2,
  startAdornment,
  endAdornment,
  ...textFieldProps
}: NumberFieldProps<TFieldValues, TName>) {
  const {
    field,
    fieldState: { error },
  } = useController<TFieldValues, TName>({
    name,
    control,
    defaultValue,
    rules,
    shouldUnregister,
    disabled,
  });

  const parseValue = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const num = typeof value === "number" ? value : parseFloat(String(value));
    return isNaN(num) ? null : num;
  };

  const currentValue = parseValue(field.value);

  const handleIncrement = () => {
    const newValue = (currentValue ?? 0) + step;
    if (max === undefined || newValue <= max) {
      field.onChange(newValue);
    }
  };

  const handleDecrement = () => {
    const newValue = (currentValue ?? 0) - step;
    if (min === undefined || newValue >= min) {
      field.onChange(newValue);
    }
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = event.target.value;

    if (inputValue === "") {
      field.onChange(null);
      return;
    }

    if (inputValue === "-" || inputValue === "." || inputValue === "-.") {
      return;
    }

    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue)) {
      field.onChange(numValue);
    }
  };

  const handleBlur = () => {
    const parsedValue = parseValue(field.value);

    if (parsedValue !== null) {
      let constrainedValue = parsedValue;

      if (min !== undefined && constrainedValue < min) {
        constrainedValue = min;
      }
      if (max !== undefined && constrainedValue > max) {
        constrainedValue = max;
      }

      const roundedValue = Number(constrainedValue.toFixed(decimalPlaces));
      field.onChange(roundedValue);
    }

    field.onBlur();
  };

  const isIncrementDisabled =
    disabled || (max !== undefined && (currentValue ?? 0) >= max);
  const isDecrementDisabled =
    disabled || (min !== undefined && (currentValue ?? 0) <= min);

  return (
    <TextField
      {...textFieldProps}
      name={field.name}
      value={field.value ?? ""}
      onChange={handleChange}
      onBlur={handleBlur}
      inputRef={field.ref}
      disabled={disabled}
      error={!!error}
      helperText={error?.message ?? textFieldProps.helperText}
      type="number"
      slotProps={{
        htmlInput: {
          step,
          min,
          max,
        },
        input: {
          startAdornment: startAdornment && (
            <InputAdornment position="start">{startAdornment}</InputAdornment>
          ),
          endAdornment: (
            <>
              {endAdornment && (
                <InputAdornment position="end">{endAdornment}</InputAdornment>
              )}
              <InputAdornment
                position="end"
                sx={{
                  ml: 0,
                  alignSelf: "stretch",
                  borderLeft: 1,
                  borderColor: "divider",
                  flexDirection: "column",
                  maxHeight: "unset",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    "& button": {
                      py: 0,
                      flex: 1,
                      borderRadius: 0,
                    },
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={handleIncrement}
                    disabled={isIncrementDisabled}
                    aria-label="Increase"
                    tabIndex={-1}
                  >
                    <KeyboardArrowUpIcon
                      fontSize="small"
                      sx={{ transform: "translateY(1px)" }}
                    />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={handleDecrement}
                    disabled={isDecrementDisabled}
                    aria-label="Decrease"
                    tabIndex={-1}
                  >
                    <KeyboardArrowDownIcon
                      fontSize="small"
                      sx={{ transform: "translateY(-1px)" }}
                    />
                  </IconButton>
                </Box>
              </InputAdornment>
            </>
          ),
        },
      }}
      sx={{
        "& .MuiOutlinedInput-root": {
          pr: 0,
        },
        ...textFieldProps.sx,
      }}
    />
  );
}
