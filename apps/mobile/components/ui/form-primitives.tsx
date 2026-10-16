import React, { useState } from "react"
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  Switch,
  Keyboard,
  StyleSheet,
  type TextInputProps as RNTextInputProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native"
import {
  Calendar,
  CalendarClock,
  ChevronRight,
  AlertCircle,
  Check,
} from "lucide-react-native"
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form"
import { AVAILABLE_COLORS, COLOR_HEX_MAP } from "@saturn/core"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { DatePickerSheet, formatDisplayDate } from "./date-picker-sheet"

// ---------------------------------------------------------------------------
// 1. FormRowInput
// ---------------------------------------------------------------------------

export interface FormRowInputProps<
  TFieldValues extends FieldValues = FieldValues,
> extends Omit<RNTextInputProps, "value"> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  label: string
  icon?: React.ReactNode
  containerStyle?: StyleProp<ViewStyle>
  labelStyle?: StyleProp<TextStyle>
  inputStyle?: StyleProp<TextStyle>
}

export function FormRowInput<TFieldValues extends FieldValues = FieldValues>({
  control,
  name,
  label,
  icon,
  containerStyle,
  labelStyle,
  inputStyle,
  onChangeText,
  onBlur,
  ...rest
}: FormRowInputProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldError = fieldState.error?.message
        return (
          <View>
            <View style={[styles.formRow, containerStyle]}>
              <View style={styles.formRowLabelGroup}>
                {icon}
                <Text style={[styles.formRowLabel, labelStyle]}>{label}</Text>
              </View>
              <RNTextInput
                ref={field.ref}
                style={[styles.formRowInput, inputStyle]}
                placeholderTextColor={theme.colors.textMuted}
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
                {...rest}
              />
            </View>
            {fieldError ? (
              <View style={styles.inlineError}>
                <AlertCircle size={12} color={theme.colors.destructive} />
                <Text style={styles.errorText}>{fieldError}</Text>
              </View>
            ) : null}
          </View>
        )
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// 2. FormSwitchRow
// ---------------------------------------------------------------------------

export interface FormSwitchRowProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  label: string
  subtitle?: string
  icon?: React.ReactNode
  disabled?: boolean
  containerStyle?: StyleProp<ViewStyle>
  activeTrackColor?: string
  onValueChange?: (value: boolean) => void
}

export function FormSwitchRow<TFieldValues extends FieldValues = FieldValues>({
  control,
  name,
  label,
  subtitle,
  icon,
  disabled,
  containerStyle,
  activeTrackColor,
  onValueChange,
}: FormSwitchRowProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <View style={[styles.formRow, containerStyle]}>
          <View
            style={[styles.formRowLabelGroup, { flex: 1, paddingRight: 8 }]}
          >
            {icon}
            <View style={{ flex: 1 }}>
              <Text style={styles.formRowLabel} numberOfLines={2}>
                {label}
              </Text>
              {subtitle ? (
                <Text style={styles.switchSubtitle} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          <Switch
            value={Boolean(field.value)}
            onValueChange={(val) => {
              haptics.light()
              field.onChange(val)
              onValueChange?.(val)
            }}
            disabled={disabled}
            trackColor={{
              false: theme.colors.surfaceElevated,
              true: activeTrackColor || theme.colors.primary,
            }}
            thumbColor="#ffffff"
          />
        </View>
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// 3. FormPillGroup
// ---------------------------------------------------------------------------

export interface FormPillOption<T = string> {
  label: string
  value: T
  icon?: React.ReactNode
  activeColor?: string
  activeBg?: string
  activeBorder?: string
  activeTextColor?: string
}

export interface FormPillGroupProps<
  TFieldValues extends FieldValues = FieldValues,
  T = string,
> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  label?: string
  options: readonly FormPillOption<T>[]
  disabled?: boolean
  readOnly?: boolean
  containerStyle?: StyleProp<ViewStyle>
  pillStyle?: StyleProp<ViewStyle>
  activeColor?: string
  activeBg?: string
  activeBorder?: string
  activeTextColor?: string
  onValueChange?: (value: T) => void
}

export function FormPillGroup<
  TFieldValues extends FieldValues = FieldValues,
  T = string,
>({
  control,
  name,
  label,
  options,
  disabled = false,
  readOnly = false,
  containerStyle,
  pillStyle,
  activeColor = theme.colors.primary,
  activeBg = "rgba(99, 102, 241, 0.15)",
  activeBorder = theme.colors.primary,
  activeTextColor = theme.colors.primary,
  onValueChange,
}: FormPillGroupProps<TFieldValues, T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const fieldError = fieldState.error?.message
        const currentValue = field.value

        return (
          <View style={[styles.pillGroupContainer, containerStyle]}>
            {label ? <Text style={styles.pillGroupLabel}>{label}</Text> : null}
            <View style={styles.pillRow}>
              {options.map((opt) => {
                const isSelected = currentValue === opt.value
                const pillBorderColor = isSelected
                  ? opt.activeBorder ||
                    opt.activeColor ||
                    activeBorder ||
                    activeColor
                  : theme.colors.border
                const pillBg = isSelected
                  ? opt.activeBg || activeBg
                  : theme.colors.surfaceElevated
                const pillTextColor = isSelected
                  ? opt.activeTextColor ||
                    opt.activeColor ||
                    activeTextColor ||
                    activeColor
                  : theme.colors.textMuted

                return (
                  <TouchableOpacity
                    key={String(opt.value)}
                    activeOpacity={readOnly || disabled ? 1 : 0.7}
                    onPress={() => {
                      if (disabled || readOnly) return
                      haptics.selection()
                      field.onChange(opt.value)
                      onValueChange?.(opt.value)
                    }}
                    disabled={disabled || readOnly}
                    style={[
                      styles.pill,
                      {
                        borderColor: pillBorderColor,
                        backgroundColor: pillBg,
                      },
                      pillStyle,
                    ]}
                  >
                    {opt.icon ? (
                      <View style={{ marginRight: 6 }}>{opt.icon}</View>
                    ) : null}
                    <Text
                      style={[
                        styles.pillText,
                        {
                          color: pillTextColor,
                          fontWeight: isSelected ? "700" : "600",
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            {fieldError ? (
              <View style={styles.inlineError}>
                <AlertCircle size={12} color={theme.colors.destructive} />
                <Text style={styles.errorText}>{fieldError}</Text>
              </View>
            ) : null}
          </View>
        )
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// 4. FormDateRow & FormEffectiveDateSection
// ---------------------------------------------------------------------------

export interface FormDateRowProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  label: string
  icon?: React.ReactNode
  disabled?: boolean
  containerStyle?: StyleProp<ViewStyle>
  title?: string
}

export function FormDateRow<TFieldValues extends FieldValues = FieldValues>({
  control,
  name,
  label,
  icon,
  disabled = false,
  containerStyle,
  title,
}: FormDateRowProps<TFieldValues>) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const rawVal = field.value as unknown
        const dateVal =
          rawVal instanceof Date
            ? rawVal
            : rawVal
              ? new Date(rawVal as string | number)
              : new Date()
        const fieldError = fieldState.error?.message

        return (
          <>
            <TouchableOpacity
              style={[styles.formRow, containerStyle]}
              activeOpacity={disabled ? 1 : 0.7}
              onPress={() => {
                if (disabled) return
                Keyboard.dismiss()
                haptics.light()
                setIsOpen(true)
              }}
              disabled={disabled}
            >
              <View style={styles.formRowLabelGroup}>
                {icon ?? <Calendar size={16} color={theme.colors.textMuted} />}
                <Text style={styles.formRowLabel}>{label}</Text>
              </View>
              <View style={styles.formRowValueGroup}>
                <Text style={styles.formRowValueText}>
                  {formatDisplayDate(dateVal)}
                </Text>
                <ChevronRight size={14} color={theme.colors.textMuted} />
              </View>
            </TouchableOpacity>
            {fieldError ? (
              <View style={styles.inlineError}>
                <AlertCircle size={12} color={theme.colors.destructive} />
                <Text style={styles.errorText}>{fieldError}</Text>
              </View>
            ) : null}
            <DatePickerSheet
              visible={isOpen}
              title={title ?? `Select ${label}`}
              value={dateVal}
              onChange={(newDate) => {
                field.onChange(newDate)
              }}
              onClose={() => setIsOpen(false)}
            />
          </>
        )
      }}
    />
  )
}

export interface FormEffectiveDateSectionProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  control: Control<TFieldValues>
  dateName?: Path<TFieldValues>
  hasCustomName?: Path<TFieldValues>
  effectiveDateName?: Path<TFieldValues>
  dateLabel?: string
  effectiveDateLabel?: string
  switchLabel?: string
  disabled?: boolean
}

export function FormEffectiveDateSection<
  TFieldValues extends FieldValues = FieldValues,
>({
  control,
  dateName = "transactionDate" as Path<TFieldValues>,
  hasCustomName = "hasCustomEffectiveDate" as Path<TFieldValues>,
  effectiveDateName = "effectiveDate" as Path<TFieldValues>,
  dateLabel = "Transaction Date",
  effectiveDateLabel = "Effective Date",
  switchLabel = "Different effective date?",
  disabled = false,
}: FormEffectiveDateSectionProps<TFieldValues>) {
  const [activeTarget, setActiveTarget] = useState<"date" | "effective" | null>(
    null
  )

  return (
    <Controller
      control={control}
      name={dateName}
      render={({ field: dateField, fieldState: dateState }) => (
        <Controller
          control={control}
          name={hasCustomName}
          render={({ field: hasCustomField }) => (
            <Controller
              control={control}
              name={effectiveDateName}
              render={({ field: effectiveField, fieldState: effState }) => {
                const rawDate = dateField.value as unknown
                const parsedDate =
                  rawDate instanceof Date
                    ? rawDate
                    : rawDate
                      ? new Date(rawDate as string | number)
                      : new Date()
                const rawEffective = effectiveField.value as unknown
                const parsedEffective =
                  rawEffective instanceof Date
                    ? rawEffective
                    : rawEffective
                      ? new Date(rawEffective as string | number)
                      : parsedDate

                return (
                  <>
                    <View>
                      <TouchableOpacity
                        style={styles.formRow}
                        activeOpacity={disabled ? 1 : 0.7}
                        onPress={() => {
                          if (disabled) return
                          Keyboard.dismiss()
                          haptics.light()
                          setActiveTarget("date")
                        }}
                        disabled={disabled}
                      >
                        <View style={styles.formRowLabelGroup}>
                          <Calendar size={16} color={theme.colors.textMuted} />
                          <Text style={styles.formRowLabel}>{dateLabel}</Text>
                        </View>
                        <View style={styles.formRowValueGroup}>
                          <Text style={styles.formRowValueText}>
                            {formatDisplayDate(parsedDate)}
                          </Text>
                          <ChevronRight
                            size={14}
                            color={theme.colors.textMuted}
                          />
                        </View>
                      </TouchableOpacity>
                      {dateState.error ? (
                        <View style={styles.inlineError}>
                          <AlertCircle
                            size={12}
                            color={theme.colors.destructive}
                          />
                          <Text style={styles.errorText}>
                            {dateState.error.message}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.rowDivider} />

                    <View style={styles.formRow}>
                      <View
                        style={[
                          styles.formRowLabelGroup,
                          { flex: 1, paddingRight: 8 },
                        ]}
                      >
                        <CalendarClock
                          size={16}
                          color={theme.colors.textMuted}
                        />
                        <Text style={styles.formRowLabel} numberOfLines={2}>
                          {switchLabel}
                        </Text>
                      </View>
                      <Switch
                        value={Boolean(hasCustomField.value)}
                        onValueChange={(val) => {
                          haptics.light()
                          hasCustomField.onChange(val)
                          if (!val) {
                            effectiveField.onChange(parsedDate)
                          }
                        }}
                        disabled={disabled}
                        trackColor={{
                          false: theme.colors.surfaceElevated,
                          true: theme.colors.primary,
                        }}
                        thumbColor="#ffffff"
                      />
                    </View>

                    {Boolean(hasCustomField.value) && (
                      <>
                        <View style={styles.rowDivider} />
                        <TouchableOpacity
                          style={styles.formRow}
                          activeOpacity={disabled ? 1 : 0.7}
                          onPress={() => {
                            if (disabled) return
                            Keyboard.dismiss()
                            haptics.light()
                            setActiveTarget("effective")
                          }}
                          disabled={disabled}
                        >
                          <View style={styles.formRowLabelGroup}>
                            <Calendar size={16} color={theme.colors.primary} />
                            <Text
                              style={[
                                styles.formRowLabel,
                                { color: theme.colors.primary },
                              ]}
                            >
                              {effectiveDateLabel}
                            </Text>
                          </View>
                          <View style={styles.formRowValueGroup}>
                            <Text
                              style={[
                                styles.formRowValueText,
                                { color: theme.colors.primary },
                              ]}
                            >
                              {formatDisplayDate(parsedEffective)}
                            </Text>
                            <ChevronRight
                              size={14}
                              color={theme.colors.primary}
                            />
                          </View>
                        </TouchableOpacity>
                        {effState.error ? (
                          <View style={styles.inlineError}>
                            <AlertCircle
                              size={12}
                              color={theme.colors.destructive}
                            />
                            <Text style={styles.errorText}>
                              {effState.error.message}
                            </Text>
                          </View>
                        ) : null}
                      </>
                    )}

                    <DatePickerSheet
                      visible={activeTarget !== null}
                      title={
                        activeTarget === "effective"
                          ? `Select ${effectiveDateLabel}`
                          : `Select ${dateLabel}`
                      }
                      value={
                        activeTarget === "effective"
                          ? parsedEffective
                          : parsedDate
                      }
                      onChange={(newDate) => {
                        if (activeTarget === "date") {
                          dateField.onChange(newDate)
                          if (!hasCustomField.value) {
                            effectiveField.onChange(newDate)
                          }
                        } else {
                          effectiveField.onChange(newDate)
                        }
                      }}
                      onClose={() => setActiveTarget(null)}
                    />
                  </>
                )
              }}
            />
          )}
        />
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// 5. FormCheckboxRow
// ---------------------------------------------------------------------------

export interface FormCheckboxRowProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  label: string
  containerStyle?: StyleProp<ViewStyle>
  onValueChange?: (value: boolean) => void
}

export function FormCheckboxRow<
  TFieldValues extends FieldValues = FieldValues,
>({
  control,
  name,
  label,
  containerStyle,
  onValueChange,
}: FormCheckboxRowProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const checked = Boolean(field.value)
        return (
          <TouchableOpacity
            style={[styles.checkboxRow, containerStyle]}
            activeOpacity={0.7}
            onPress={() => {
              haptics.selection()
              const next = !checked
              field.onChange(next)
              onValueChange?.(next)
            }}
          >
            <View style={[styles.checkbox, checked && styles.checkboxActive]}>
              {checked ? (
                <Check size={13} color="#090d16" strokeWidth={3} />
              ) : null}
            </View>
            <Text style={styles.checkboxText}>{label}</Text>
          </TouchableOpacity>
        )
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// 6. FormColorPicker
// ---------------------------------------------------------------------------

export interface FormColorPickerProps<
  TFieldValues extends FieldValues = FieldValues,
> {
  control: Control<TFieldValues>
  name: Path<TFieldValues>
  colors?: readonly string[]
  getColorHex?: (colorName: string) => string
  containerStyle?: StyleProp<ViewStyle>
  onValueChange?: (colorName: string) => void
}

export function FormColorPicker<
  TFieldValues extends FieldValues = FieldValues,
>({
  control,
  name,
  colors = AVAILABLE_COLORS,
  getColorHex = (c) =>
    COLOR_HEX_MAP[c as keyof typeof COLOR_HEX_MAP] || COLOR_HEX_MAP.indigo,
  containerStyle,
  onValueChange,
}: FormColorPickerProps<TFieldValues>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => {
        const selectedColor = String(field.value || "indigo")
        return (
          <View style={[styles.colorPaletteRow, containerStyle]}>
            {colors.map((c) => {
              const isSelected = selectedColor === c
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => {
                    haptics.selection()
                    field.onChange(c)
                    onValueChange?.(c)
                  }}
                  style={[
                    styles.colorCircle,
                    { backgroundColor: getColorHex(c) },
                    isSelected && styles.colorCircleSelected,
                  ]}
                >
                  {isSelected ? <Check size={16} color="#ffffff" /> : null}
                </TouchableOpacity>
              )
            })}
          </View>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  formRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  formRowLabelGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  formRowLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textMuted,
  },
  formRowInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textPrimary,
    textAlign: "right",
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginLeft: 16,
  },
  formRowValueGroup: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  formRowValueText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    textAlign: "right",
    flexShrink: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: 42,
  },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    marginTop: -4,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    fontWeight: "500",
  },
  switchSubtitle: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  pillGroupContainer: {
    gap: 8,
  },
  pillGroupLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radius.md,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 10,
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: theme.colors.borderStrong,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  checkboxText: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.textSecondary,
  },
  colorPaletteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 4,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorCircleSelected: {
    borderColor: "#ffffff",
    transform: [{ scale: 1.08 }],
  },
})
