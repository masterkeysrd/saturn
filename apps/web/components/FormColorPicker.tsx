import {
  useController,
  type UseControllerProps,
  type FieldValues,
  type FieldPath,
} from "react-hook-form";

import FloatingColorPicker, {
  type FloatingColorPickerProps,
} from "./FloatingColorPicker";

export interface FormColorPickerProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> extends Omit<UseControllerProps<TFieldValues, TName>, "render">,
    FloatingColorPickerProps {}

export function FormColorPicker<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
  name,
  control,
  defaultValue,
  rules,
  shouldUnregister,
  disabled,
  ...rest
}: FormColorPickerProps<TFieldValues, TName>) {
  const { field } = useController<TFieldValues, TName>({
    name,
    control,
    defaultValue,
    rules,
    shouldUnregister,
    disabled,
  });

  return (
    <FloatingColorPicker
      {...rest}
      value={field.value}
      onChange={field.onChange}
    />
  );
}
