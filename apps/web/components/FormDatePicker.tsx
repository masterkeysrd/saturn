import {
  type Control,
  type FieldError,
  type FieldPath,
  type FieldValues,
  type PathValue,
  useController,
  type UseControllerProps,
} from "react-hook-form";
import { type TextFieldProps, useForkRef } from "@mui/material";
import {
  DatePicker,
  type DatePickerProps,
  type DatePickerSlotProps,
  type DateValidationError,
  type PickerChangeHandlerContext,
  usePickerAdapter,
  validateDate,
} from "@mui/x-date-pickers";
import { type PickerValidDate } from "@mui/x-date-pickers/models";
import { useApplyDefaultValuesToDateValidationProps } from "@mui/x-date-pickers/internals";
import { forwardRef, type FocusEvent } from "react";
import { useFormError, useTransform } from "react-hook-form-mui";

const defaultErrorMessages: {
  [v in NonNullable<DateValidationError>]: string;
} = {
  disableFuture: "Date must be in the past",
  maxDate: "Date is later than the maximum allowed date",
  disablePast: "Past date is not allowed",
  invalidDate: "Date is invalid",
  minDate: "Date is earlier than the minimum allowed date",
  shouldDisableDate: "Date is not allowed",
  shouldDisableMonth: "Month is not allowed",
  shouldDisableYear: "Year is not allowed",
};

function getTimezone<TDate extends PickerValidDate>(
  adapter: ReturnType<typeof usePickerAdapter>,
  value: TDate,
): string | null {
  return value == null || !adapter.isValid(value)
    ? null
    : adapter.getTimezone(value);
}

function readValueAsDate<TDate extends PickerValidDate>(
  adapter: ReturnType<typeof usePickerAdapter>,
  value: string | null | TDate,
): TDate | null {
  if (typeof value === "string") {
    if (value === "") {
      return null;
    }
    return adapter.date(value) as TDate;
  }
  return value;
}

export type DatePickerElementProps<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TValue extends PickerValidDate = PickerValidDate,
  TEnableAccessibleFieldDOMStructure extends boolean = false,
> = Omit<DatePickerProps, "value" | "slotProps"> & {
  name: TName;
  required?: boolean;
  isDate?: boolean;
  parseError?: (error: FieldError | DateValidationError) => React.ReactNode;
  rules?: UseControllerProps<TFieldValues, TName>["rules"];
  control?: Control<TFieldValues>;
  inputProps?: TextFieldProps;
  helperText?: TextFieldProps["helperText"];
  textReadOnly?: boolean;
  slotProps?: Omit<
    DatePickerSlotProps<TEnableAccessibleFieldDOMStructure>,
    "textField"
  >;
  overwriteErrorMessages?: typeof defaultErrorMessages;
  transform?: {
    input?: (value: PathValue<TFieldValues, TName>) => TValue | null;
    output?: (
      value: TValue | null,
      context: PickerChangeHandlerContext<DateValidationError>,
    ) => PathValue<TFieldValues, TName>;
  };
};

type DatePickerElementComponent = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TValue extends PickerValidDate = PickerValidDate,
>(
  props: DatePickerElementProps<TFieldValues, TName, TValue> &
    React.RefAttributes<HTMLDivElement>,
) => React.ReactElement;

const DatePickerElement = forwardRef(function DatePickerElement<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
  TValue extends PickerValidDate = PickerValidDate,
>(
  props: DatePickerElementProps<TFieldValues, TName, TValue>,
  ref: React.Ref<HTMLDivElement>,
) {
  const {
    parseError,
    name,
    required,
    rules = {},
    inputProps,
    control,
    textReadOnly,
    slotProps,
    overwriteErrorMessages,
    inputRef,
    transform,
    ...rest
  } = props;

  const adapter = usePickerAdapter();
  const validationProps = useApplyDefaultValuesToDateValidationProps(rest);

  const errorMsgFn = useFormError();
  const customErrorFn = parseError || errorMsgFn;

  const errorMessages = {
    ...defaultErrorMessages,
    ...overwriteErrorMessages,
  };

  const rulesTmp = {
    ...rules,
    ...(required &&
      !rules.required && {
        required: "This field is required",
      }),
    validate: {
      internal: (value: TValue | null) => {
        const date = readValueAsDate(adapter, value);
        if (!date) {
          return true;
        }
        const internalError = validateDate({
          props: {
            shouldDisableDate: rest.shouldDisableDate,
            shouldDisableMonth: rest.shouldDisableMonth,
            shouldDisableYear: rest.shouldDisableYear,
            ...validationProps,
          },
          timezone: rest.timezone ?? getTimezone(adapter, date) ?? "default",
          value: date,
          adapter: adapter,
        });
        return internalError == null || errorMessages[internalError];
      },
      ...rules.validate,
    },
  };

  const {
    field,
    fieldState: { error },
  } = useController({
    name,
    control,
    rules: rulesTmp,
    disabled: rest.disabled,
    defaultValue: null as PathValue<TFieldValues, TName>,
  });

  const { value, onChange } = useTransform<TFieldValues, TName, TValue | null>({
    value: field.value,
    onChange: field.onChange,
    transform: {
      input:
        typeof transform?.input === "function"
          ? transform.input
          : (newValue) => readValueAsDate(adapter, newValue),
      output:
        typeof transform?.output === "function"
          ? transform.output
          : (newValue) => newValue,
    },
  });

  const handleInputRef = useForkRef(field.ref, inputRef);

  const errorMessage = error
    ? typeof customErrorFn === "function"
      ? customErrorFn(error)
      : error.message
    : null;

  return (
    <DatePicker
      {...rest}
      {...field}
      value={value}
      ref={ref}
      inputRef={handleInputRef}
      onClose={(...args) => {
        field.onBlur();
        if (rest.onClose) {
          rest.onClose(...args);
        }
      }}
      onChange={(newValue, context) => {
        onChange(newValue, context);
        if (typeof rest.onChange === "function") {
          rest.onChange(newValue, context);
        }
      }}
      slotProps={{
        ...slotProps,
        textField: {
          ...inputProps,
          required,
          onBlur: (
            event: FocusEvent<HTMLInputElement | HTMLTextAreaElement, Element>,
          ) => {
            field.onBlur();
            if (typeof inputProps?.onBlur === "function") {
              inputProps.onBlur(event);
            }
          },
          error: !!errorMessage,
          helperText: errorMessage
            ? errorMessage
            : inputProps?.helperText || rest.helperText,
          inputProps: {
            readOnly: !!textReadOnly,
            ...inputProps?.inputProps,
          },
        },
      }}
    />
  );
});
DatePickerElement.displayName = "DatePickerElement";
export default DatePickerElement as DatePickerElementComponent;
