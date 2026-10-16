import React from "react"
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  Keyboard,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { ChevronDown, AlertCircle } from "lucide-react-native"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"
import { theme } from "@/lib/theme"

export function sanitizeAmountString(val: string): string {
  if (!val) return ""
  let clean = val.replace(/[^0-9.]/g, "")
  const parts = clean.split(".")
  if (parts.length > 2) {
    clean = parts[0] + "." + parts.slice(1).join("")
  }
  const [intPart, decPart] = clean.split(".")
  if (decPart !== undefined) {
    clean = `${intPart}.${decPart.slice(0, 2)}`
  }
  return clean
}

export interface HeroAmountInputProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  label?: string
  currency?: string
  currencySymbol?: string
  onPressCurrency?: () => void
  currencyDisabled?: boolean
  accentColor?: string
  placeholder?: string
  autoFocus?: boolean
  containerStyle?: StyleProp<ViewStyle>
}

export function HeroAmountInput<
  TFieldValues extends FieldValues = FieldValues,
>({
  control,
  name,
  label = "AMOUNT",
  currency,
  currencySymbol = "$",
  onPressCurrency,
  currencyDisabled = false,
  accentColor = theme.colors.destructive,
  placeholder = "0.00",
  autoFocus = false,
  containerStyle,
}: HeroAmountInputProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldError = fieldState.error?.message
        const handleChangeText = (text: string) => {
          field.onChange(sanitizeAmountString(text))
        }

        return (
          <View style={[styles.amountCard, containerStyle]}>
            {label ? (
              <Text style={styles.fieldSectionLabel}>{label}</Text>
            ) : null}
            <View style={styles.amountInputRow}>
              <Text
                style={[styles.amountCurrencyPrefix, { color: accentColor }]}
              >
                {currencySymbol}
              </Text>
              <RNTextInput
                ref={field.ref}
                style={[styles.amountInput, { color: accentColor }]}
                keyboardType="decimal-pad"
                value={
                  field.value !== undefined && field.value !== null
                    ? String(field.value)
                    : ""
                }
                placeholder={placeholder}
                placeholderTextColor={theme.colors.textMuted}
                onChangeText={handleChangeText}
                autoFocus={autoFocus}
                selectionColor={accentColor}
              />

              {currency ? (
                <TouchableOpacity
                  style={styles.currencySelectButton}
                  activeOpacity={onPressCurrency && !currencyDisabled ? 0.7 : 1}
                  onPress={() => {
                    if (onPressCurrency && !currencyDisabled) {
                      Keyboard.dismiss()
                      onPressCurrency()
                    }
                  }}
                  disabled={!onPressCurrency || currencyDisabled}
                >
                  <Text style={styles.currencySelectCode} numberOfLines={1}>
                    {currency.toUpperCase()}
                  </Text>
                  {onPressCurrency && !currencyDisabled && (
                    <ChevronDown size={14} color={theme.colors.textMuted} />
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
            {fieldError ? (
              <View style={styles.errorRow}>
                <AlertCircle size={13} color={theme.colors.destructive} />
                <Text style={styles.errorText}>{fieldError}</Text>
              </View>
            ) : null}
          </View>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  amountCard: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 12,
  },
  fieldSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  amountCurrencyPrefix: {
    fontSize: 34,
    fontWeight: "800",
    marginRight: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 0,
  },
  amountInput: {
    flex: 1,
    fontSize: 34,
    fontWeight: "800",
    padding: 0,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  currencySelectButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 68,
  },
  currencySelectCode: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    fontWeight: "500",
  },
})
