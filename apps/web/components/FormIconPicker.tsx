import {
  useController,
  type UseControllerProps,
  type FieldValues,
  type FieldPath,
} from "react-hook-form";
import FloatingIconPicker from "./FloatingIconPicker";
import type { FloatingIconPickerProps } from "./FloatingIconPicker";
import { Box } from "@mui/material";

export interface FormIconPickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends Omit<UseControllerProps<TFieldValues, TName>, "render">,
    Omit<FloatingIconPickerProps, "value" | "onChange"> {}

export function FormIconPicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: FormIconPickerProps<TFieldValues, TName>) {
  const {
    name,
    control,
    defaultValue,
    rules,
    shouldUnregister,
    disabled,
    ...pickerProps // Remaining FloatingIconPicker props
  } = props;

  const { field } = useController<TFieldValues, TName>({
    name,
    control,
    defaultValue,
    rules,
    shouldUnregister,
    disabled,
  });

  return (
    <Box sx={{ height: pickerProps.size, width: pickerProps.size }}>
      <FloatingIconPicker
        {...pickerProps}
        value={field.value}
        onChange={field.onChange}
      />
    </Box>
  );
}
