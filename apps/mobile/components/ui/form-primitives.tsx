import React, { useState } from "react"
import {
  View,
  Text,
  TextInput as RNTextInput,
  TouchableOpacity,
  Switch,
  Keyboard,
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
import { useTimezone } from "@saturn/hooks"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
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
  const { colors, isDark } = useTheme()
  const styles = useThemedStyles(createStyles)

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
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={isDark ? "dark" : "light"}
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
                <AlertCircle size={12} color={colors.destructive} />
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
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

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
              false: colors.surfaceElevated,
              true: activeTrackColor || colors.primary,
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
  activeColor,
  activeBg,
  activeBorder,
  activeTextColor,
  onValueChange,
}: FormPillGroupProps<TFieldValues, T>) {
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const resolvedActiveColor = activeColor ?? colors.primary
  const resolvedActiveBg = activeBg ?? colors.primarySubtle
  const resolvedActiveBorder = activeBorder ?? colors.primary
  const resolvedActiveTextColor = activeTextColor ?? colors.primary

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
                    resolvedActiveBorder ||
                    resolvedActiveColor
                  : colors.border
                const pillBg = isSelected
                  ? opt.activeBg || resolvedActiveBg
                  : colors.surfaceElevated
                const pillTextColor = isSelected
                  ? opt.activeTextColor ||
                    opt.activeColor ||
                    resolvedActiveTextColor ||
                    resolvedActiveColor
                  : colors.textMuted

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
                <AlertCircle size={12} color={colors.destructive} />
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
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [isOpen, setIsOpen] = useState(false)
  const tz = useTimezone()

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
                {icon ?? <Calendar size={16} color={colors.textMuted} />}
                <Text style={styles.formRowLabel}>{label}</Text>
              </View>
              <View style={styles.formRowValueGroup}>
                <Text style={styles.formRowValueText}>
                  {formatDisplayDate(dateVal, tz.timezone, tz.locale)}
                </Text>
                <ChevronRight size={14} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
            {fieldError ? (
              <View style={styles.inlineError}>
                <AlertCircle size={12} color={colors.destructive} />
                <Text style={styles.errorText}>{fieldError}</Text>
              </View>
            ) : null}
            <DatePickerSheet
              visible={isOpen}
              title={title ?? label}
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
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const [activeTarget, setActiveTarget] = useState<"date" | "effective" | null>(
    null
  )
  const tz = useTimezone()

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
                          <Calendar size={16} color={colors.textMuted} />
                          <Text style={styles.formRowLabel}>{dateLabel}</Text>
                        </View>
                        <View style={styles.formRowValueGroup}>
                          <Text style={styles.formRowValueText}>
                            {formatDisplayDate(
                              parsedDate,
                              tz.timezone,
                              tz.locale
                            )}
                          </Text>
                          <ChevronRight size={14} color={colors.textMuted} />
                        </View>
                      </TouchableOpacity>
                      {dateState.error ? (
                        <View style={styles.inlineError}>
                          <AlertCircle size={12} color={colors.destructive} />
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
                        <CalendarClock size={16} color={colors.textMuted} />
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
                          false: colors.surfaceElevated,
                          true: colors.primary,
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
                            <Calendar size={16} color={colors.primary} />
                            <Text
                              style={[
                                styles.formRowLabel,
                                { color: colors.primary },
                              ]}
                            >
                              {effectiveDateLabel}
                            </Text>
                          </View>
                          <View style={styles.formRowValueGroup}>
                            <Text
                              style={[
                                styles.formRowValueText,
                                { color: colors.primary },
                              ]}
                            >
                              {formatDisplayDate(
                                parsedEffective,
                                tz.timezone,
                                tz.locale
                              )}
                            </Text>
                            <ChevronRight size={14} color={colors.primary} />
                          </View>
                        </TouchableOpacity>
                        {effState.error ? (
                          <View style={styles.inlineError}>
                            <AlertCircle size={12} color={colors.destructive} />
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
                          ? effectiveDateLabel
                          : dateLabel
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
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

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
                <Check
                  size={13}
                  color={colors.primaryForeground}
                  strokeWidth={3}
                />
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
  const styles = useThemedStyles(createStyles)

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

const createStyles = (t: SaturnMobileTheme) => ({
  formRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  formRowLabelGroup: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    flexShrink: 0,
  },
  formRowLabel: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textMuted,
  },
  formRowInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textPrimary,
    textAlign: "right" as const,
    paddingVertical: 0,
    paddingHorizontal: 0,
    marginLeft: 16,
  },
  formRowValueGroup: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "flex-end" as const,
    gap: 6,
  },
  formRowValueText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    textAlign: "right" as const,
    flexShrink: 1,
  },
  rowDivider: {
    height: 1,
    backgroundColor: t.colors.border,
    marginLeft: 42,
  },
  inlineError: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
    marginTop: -4,
  },
  errorText: {
    fontSize: 12,
    color: t.colors.destructive,
    fontWeight: "500" as const,
  },
  switchSubtitle: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  pillGroupContainer: {
    gap: 8,
  },
  pillGroupLabel: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
    marginBottom: 4,
  },
  pillRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  pill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: t.radius.md,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 13,
  },
  checkboxRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
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
    borderColor: t.colors.borderStrong,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkboxActive: {
    backgroundColor: t.colors.primary,
    borderColor: t.colors.primary,
  },
  checkboxText: {
    fontSize: 14,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
  },
  colorPaletteRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 10,
    paddingVertical: 4,
  },
  colorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorCircleSelected: {
    borderColor: t.colors.textPrimary,
    transform: [{ scale: 1.08 }],
  },
})
