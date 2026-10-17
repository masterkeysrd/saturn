import React, { useState } from "react"
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  StyleSheet,
  type TextInputProps as RNTextInputProps,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { Eye, EyeOff } from "lucide-react-native"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"
import { theme } from "@/lib/theme"

export interface BaseTextInputProps extends RNTextInputProps {
  label?: string
  error?: string
  helper?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  isPassword?: boolean
  containerStyle?: StyleProp<ViewStyle>
  inputContainerStyle?: StyleProp<ViewStyle>
}

export interface TextInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends Omit<BaseTextInputProps, "value"> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
}

export type TextInputRef = React.ComponentRef<typeof RNTextInput>

export const BaseTextInput = React.forwardRef<TextInputRef, BaseTextInputProps>(
  function BaseTextInput(
    {
      label,
      error,
      helper,
      leftIcon,
      rightIcon,
      isPassword = false,
      containerStyle,
      inputContainerStyle,
      style,
      onFocus,
      onBlur,
      secureTextEntry,
      ...props
    },
    ref
  ) {
    const [isFocused, setIsFocused] = useState(false)
    const [isPasswordVisible, setIsPasswordVisible] = useState(false)

    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={styles.label}>{label}</Text>}
        <View
          style={[
            styles.inputWrapper,
            isFocused && styles.inputWrapperFocused,
            error ? styles.inputWrapperError : undefined,
            inputContainerStyle,
          ]}
        >
          {leftIcon && <View style={styles.leftIconContainer}>{leftIcon}</View>}
          <RNTextInput
            ref={ref}
            style={[styles.input, style]}
            placeholderTextColor={theme.colors.textMuted}
            secureTextEntry={isPassword ? !isPasswordVisible : secureTextEntry}
            onFocus={(e) => {
              setIsFocused(true)
              onFocus?.(e)
            }}
            onBlur={(e) => {
              setIsFocused(false)
              onBlur?.(e)
            }}
            {...props}
          />
          {isPassword ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsPasswordVisible(!isPasswordVisible)}
              style={styles.rightIconContainer}
            >
              {isPasswordVisible ? (
                <EyeOff size={18} color={theme.colors.textMuted} />
              ) : (
                <Eye size={18} color={theme.colors.textMuted} />
              )}
            </TouchableOpacity>
          ) : rightIcon ? (
            <View style={styles.rightIconContainer}>{rightIcon}</View>
          ) : null}
        </View>
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : helper ? (
          <Text style={styles.helperText}>{helper}</Text>
        ) : null}
      </View>
    )
  }
)

export const TextInput = React.forwardRef(function TextInput<
  TFieldValues extends FieldValues = FieldValues,
>(
  {
    control,
    name,
    onChangeText,
    onBlur,
    error,
    ...rest
  }: TextInputProps<TFieldValues>,
  ref: React.ForwardedRef<TextInputRef>
) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <BaseTextInput
          {...rest}
          ref={(instance) => {
            field.ref(instance)
            if (typeof ref === "function") {
              ref(instance)
            } else if (ref) {
              ref.current = instance
            }
          }}
          value={
            field.value !== undefined && field.value !== null
              ? String(field.value)
              : ""
          }
          onChangeText={(val) => {
            field.onChange(val)
            onChangeText?.(val)
          }}
          onBlur={(e) => {
            field.onBlur()
            onBlur?.(e)
          }}
          error={error ?? fieldState.error?.message}
        />
      )}
    />
  )
}) as <TFieldValues extends FieldValues = FieldValues>(
  props: TextInputProps<TFieldValues> & { ref?: React.Ref<TextInputRef> }
) => React.ReactElement

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  inputWrapperFocused: {
    borderColor: theme.colors.borderFocus,
  },
  inputWrapperError: {
    borderColor: theme.colors.destructive,
  },
  input: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 15,
    paddingVertical: 10,
  },
  leftIconContainer: {
    marginRight: 10,
  },
  rightIconContainer: {
    marginLeft: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
  },
  helperText: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
})
