import { useState, useRef, useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Keyboard,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import { X, Trash2, AlertTriangle } from "lucide-react-native"
import {
  useCreateBudgetMutation,
  useUpdateBudgetMutation,
  useDeleteBudgetMutation,
  useGetBudgetQuery,
  useListCurrenciesQuery,
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetSettingsQuery,
  type Budget,
  type Budget_RecurrenceInterval,
  type Budget_Status,
  type CurrencyInfo,
  type Account,
  type Account_InstitutionInfo,
  type LimitPropagation,
} from "@saturn/api/saturn/finance/v1/finance"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { BudgetSchema, type BudgetFormValues } from "@saturn/schemas"
import {
  toCentsString,
  formatCents,
  formatAmount,
  getCurrencySymbol,
  BUDGET_INTERVAL_OPTIONS as INTERVAL_OPTIONS,
  PROPAGATION_OPTIONS,
} from "@saturn/core"
import {
  invalidateFinanceQueries,
  useCurrencyConversionPreview,
} from "@saturn/hooks/finance"
import { useI18n } from "@saturn/hooks"
import { getLocalizedEnumLabel } from "@saturn/i18n"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { TextInput } from "@/components/ui/text-input"
import { HeroAmountInput } from "@/components/ui/amount-input"
import { FormPillGroup, FormColorPicker } from "@/components/ui/form-primitives"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { BUDGET_ICONS, BudgetCategoryIcon } from "@/lib/budget-icons"
import {
  CurrencyPickerSheet,
  AccountPickerSheet,
} from "@/components/finance/sheets"
import { AccountCardSelect } from "@/components/finance/account-select"

export default function ManageBudgetModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editBudgetId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editBudgetId)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { t, locale } = useI18n()
  const { colors, getBudgetColors } = useTheme()
  const styles = useThemedStyles(createStyles)

  // Bottom sheets
  const currencySheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)

  // Fetch settings & base currency
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // Fetch currencies & accounts
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: !!activeSpaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies: CurrencyInfo[] = currenciesData?.currencies || []

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )
  const accounts: Account[] = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )

  // Fetch institutions
  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions: Account_InstitutionInfo[] = instData?.institutions || []

  // Fetch existing budget if edit mode
  const { data: existingBudget, isLoading: isBudgetLoading } =
    useGetBudgetQuery(
      { id: editBudgetId || "" },
      { enabled: isEditMode && !!editBudgetId && !!activeSpaceId }
    )

  const defaultFormValues: BudgetFormValues = useMemo(
    () => ({
      name: existingBudget?.name || "",
      limit: existingBudget?.limitAmount
        ? formatCents(existingBudget.limitAmount).toString()
        : "",
      currency: existingBudget?.currency || baseCurrency,
      interval: (existingBudget?.interval ||
        "MONTHLY") as Budget_RecurrenceInterval,
      status: (existingBudget?.status || "ACTIVE") as Budget_Status,
      color: existingBudget?.color || "indigo",
      icon: existingBudget?.icon || "piggy-bank",
      defaultAccountId: existingBudget?.defaultAccountId || "",
    }),
    [existingBudget, baseCurrency]
  )

  // RHF Form
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { isSubmitting },
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(BudgetSchema),
    defaultValues: defaultFormValues,
    values: defaultFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  const [propagation, setPropagation] = useState<LimitPropagation>(
    "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
  )

  // Watch form fields in a single tuple
  const [
    limit = "",
    color = "indigo",
    currency = baseCurrency,
    interval = "MONTHLY" as Budget_RecurrenceInterval,
    status = "ACTIVE" as Budget_Status,
    icon = "piggy-bank",
    defaultAccountId = "",
  ] = useWatch({
    control,
    name: [
      "limit",
      "color",
      "currency",
      "interval",
      "status",
      "icon",
      "defaultAccountId",
    ] as const,
  })

  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })
  const conversion = getConversionPreview(limit, currency)

  // Mutations
  const createMutation = useCreateBudgetMutation()
  const updateMutation = useUpdateBudgetMutation()
  const deleteMutation = useDeleteBudgetMutation()

  const isSaving =
    createMutation.isPending || updateMutation.isPending || isSubmitting
  const isDeleting = deleteMutation.isPending

  const activeColorMeta = getBudgetColors(color)

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === defaultAccountId),
    [accounts, defaultAccountId]
  )

  const onValid = async (values: BudgetFormValues) => {
    haptics.light()

    const centsStr = toCentsString(values.limit)

    try {
      if (isEditMode && editBudgetId) {
        await updateMutation.mutateAsync({
          id: editBudgetId,
          req: {
            id: editBudgetId,
            version: existingBudget?.version,
            budget: {
              ...(existingBudget || {}),
              name: values.name.trim(),
              limitAmount: centsStr,
              currency: existingBudget?.currency || baseCurrency,
              interval: existingBudget?.interval || "MONTHLY",
              status: values.status || "ACTIVE",
              icon: values.icon,
              color: values.color,
              defaultAccountId: values.defaultAccountId || undefined,
            } as Budget,
            propagation,
            updateMask: {
              paths: [
                "name",
                "limit_amount",
                "status",
                "icon",
                "color",
                "default_account_id",
              ],
            },
          },
        })
        haptics.success()
        toast.show({
          title: t("finance.budgets.mobile.toastUpdatedTitle"),
          message: t("finance.budgets.mobile.toastUpdatedDesc", {
            name: values.name.trim(),
          }),
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          budget: {
            name: values.name.trim(),
            limitAmount: centsStr,
            currency: values.currency,
            interval: values.interval,
            status: "ACTIVE",
            icon: values.icon,
            color: values.color,
            defaultAccountId: values.defaultAccountId || undefined,
          },
        })
        haptics.success()
        toast.show({
          title: t("finance.budgets.mobile.toastCreatedTitle"),
          message: t("finance.budgets.mobile.toastCreatedDesc", {
            name: values.name.trim(),
          }),
          type: "success",
        })
      }

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: t("calendar.saveFailed"),
        message: err?.message || t("finance.budgets.mobile.toastSaveFailed"),
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!editBudgetId) return
    const budgetName = getValues("name")
    haptics.warning()
    Alert.alert(
      t("finance.budgets.mobile.menuDelete"),
      t("finance.budgets.mobile.deleteAlertDesc", { name: budgetName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: editBudgetId,
                req: {
                  id: editBudgetId,
                  version: existingBudget?.version,
                },
              })
              haptics.success()
              toast.show({
                title: t("finance.budgets.deletedTitle"),
                message: t("finance.budgets.mobile.toastDeleteDesc", {
                  name: budgetName,
                }),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              if (router.canDismiss()) {
                router.dismiss()
              }
              router.replace("/(app)/finance/budgets")
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: t("finance.budgets.deleteFailedTitle"),
                message:
                  err?.message || t("finance.budgets.mobile.toastDeleteFailed"),
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  if (isEditMode && isBudgetLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode
            ? t("finance.budgets.mobile.sheetTitleEdit")
            : t("finance.budgets.mobile.sheetTitleNew"),
          ...(Platform.OS === "ios"
            ? {
                unstable_headerLeftItems: () => [
                  {
                    type: "button",
                    label: t("common.close"),
                    icon: { type: "sfSymbol", name: "xmark" },
                    onPress: () => router.back(),
                  },
                ],
                unstable_headerRightItems: () => [
                  isSaving
                    ? {
                        type: "custom",
                        hidesSharedBackground: true,
                        element: (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        ),
                      }
                    : {
                        type: "button",
                        label: t("common.save"),
                        variant: "done",
                        onPress: () => handleSubmit(onValid)(),
                      },
                ],
              }
            : {
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => router.back()}
                    style={styles.headerBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                ),
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => handleSubmit(onValid)()}
                    disabled={isSaving}
                    style={[styles.headerSaveBtn, isSaving && { opacity: 0.6 }]}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {isSaving ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Text style={styles.headerSaveBtnText}>
                        {t("common.save")}
                      </Text>
                    )}
                  </TouchableOpacity>
                ),
              }),
        }}
      />

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Limit Amount Hero Card */}
          <HeroAmountInput
            control={control}
            name="limit"
            label={t("finance.budgets.mobile.heroLabel").toUpperCase()}
            currency={currency}
            currencySymbol={getCurrencySymbol(currency)}
            currencyDisabled={isEditMode}
            onPressCurrency={() => {
              haptics.light()
              currencySheetRef.current?.expand()
            }}
            accentColor={activeColorMeta.bar}
            containerStyle={{ marginBottom: 0 }}
          />

          {/* Live Currency Conversion Preview */}
          {currency !== baseCurrency && conversion ? (
            <View style={styles.conversionPreviewWrap}>
              {"amount" in conversion ? (
                <View style={styles.conversionPreviewRow}>
                  <Text style={styles.conversionPreviewText}>
                    ≈{" "}
                    {formatAmount(
                      Math.round(conversion.amount * 100),
                      baseCurrency
                    )}{" "}
                    <Text style={styles.conversionPreviewRate}>
                      (1 {currency} = {conversion.rate.toFixed(4)}{" "}
                      {baseCurrency})
                    </Text>
                  </Text>
                </View>
              ) : (
                <View style={styles.conversionWarningRow}>
                  <AlertTriangle size={14} color={colors.warning} />
                  <Text style={styles.conversionWarningText}>
                    {conversion.error}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Budget Name Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              {t("finance.budgets.mobile.detailsSection").toUpperCase()}
            </Text>
            <TextInput
              control={control}
              name="name"
              label={t("finance.budgets.sheet.nameLabel")}
              placeholder={t("finance.budgets.mobile.namePlaceholder")}
              placeholderTextColor={colors.textMuted}
              containerStyle={{ marginBottom: 16 }}
            />

            {/* Recurrence Interval */}
            <Text style={styles.fieldSubLabel}>
              {t("finance.budgets.mobile.recurrenceFrequency")}
            </Text>
            {isEditMode ? (
              <View style={styles.intervalRow}>
                <View
                  style={[
                    styles.intervalPill,
                    styles.intervalPillActive,
                    {
                      borderColor: activeColorMeta.bar,
                      backgroundColor: activeColorMeta.bg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.intervalPillText,
                      styles.intervalPillTextActive,
                      { color: activeColorMeta.text },
                    ]}
                  >
                    {getLocalizedEnumLabel(
                      "finance",
                      "interval",
                      interval,
                      locale
                    )}
                  </Text>
                </View>
              </View>
            ) : (
              <FormPillGroup
                control={control}
                name="interval"
                options={INTERVAL_OPTIONS.map((opt) => ({
                  ...opt,
                  label: getLocalizedEnumLabel(
                    "finance",
                    "interval",
                    opt.value,
                    locale
                  ),
                }))}
                activeColor={activeColorMeta.bar}
                activeBg={activeColorMeta.bg}
                activeBorder={activeColorMeta.bar}
                activeTextColor={activeColorMeta.text}
                pillStyle={{ flex: 1 }}
              />
            )}

            {/* Limit Propagation Rule (Edit mode only) */}
            {isEditMode && (
              <>
                <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
                  {t("finance.budgets.sheet.propagationLabel")}
                </Text>
                <View style={styles.intervalRow}>
                  {PROPAGATION_OPTIONS.map((opt) => {
                    const isSelected = propagation === opt.value
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        onPress={() => {
                          haptics.selection()
                          setPropagation(opt.value)
                        }}
                        style={[
                          styles.intervalPill,
                          isSelected && [
                            styles.intervalPillActive,
                            { borderColor: activeColorMeta.bar },
                          ],
                        ]}
                      >
                        <Text
                          style={[
                            styles.intervalPillText,
                            isSelected && [
                              styles.intervalPillTextActive,
                              { color: activeColorMeta.text },
                            ],
                          ]}
                          numberOfLines={1}
                        >
                          {getLocalizedEnumLabel(
                            "finance",
                            "limitPropagation",
                            opt.value,
                            locale
                          )}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <Text style={styles.fieldHelperText}>
                  {propagation === "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
                    ? t("finance.budgets.mobile.propagationHelperFuture")
                    : t("finance.budgets.mobile.propagationHelperCurrent")}
                </Text>
              </>
            )}

            {/* Lifecycle Status (Edit mode only) */}
            {isEditMode && (
              <>
                <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
                  {t("finance.budgets.sheet.statusLabel")}
                </Text>
                <FormPillGroup
                  control={control}
                  name="status"
                  options={[
                    {
                      value: "ACTIVE" as Budget_Status,
                      label: getLocalizedEnumLabel(
                        "finance",
                        "status",
                        "ACTIVE",
                        locale
                      ),
                      activeBorder: activeColorMeta.bar,
                      activeBg: activeColorMeta.bg,
                      activeTextColor: activeColorMeta.text,
                    },
                    {
                      value: "PAUSED" as Budget_Status,
                      label: getLocalizedEnumLabel(
                        "finance",
                        "status",
                        "PAUSED",
                        locale
                      ),
                      activeBorder: colors.warning,
                      activeBg: colors.warningSubtle,
                      activeTextColor: colors.warning,
                    },
                    {
                      value: "CLOSED" as Budget_Status,
                      label: getLocalizedEnumLabel(
                        "finance",
                        "status",
                        "CLOSED",
                        locale
                      ),
                      activeBorder: colors.destructive,
                      activeBg: colors.destructiveSubtle,
                      activeTextColor: colors.destructive,
                    },
                  ]}
                  pillStyle={{ flex: 1 }}
                />
                <Text style={styles.fieldHelperText}>
                  {status === "ACTIVE"
                    ? t("finance.budgets.mobile.statusHelperActive")
                    : status === "PAUSED"
                      ? t("finance.budgets.mobile.statusHelperPaused")
                      : t("finance.budgets.mobile.statusHelperClosed")}
                </Text>
              </>
            )}

            {/* Default Account Selector */}
            <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
              {t("finance.budgets.mobile.defaultAccountOptional")}
            </Text>
            <AccountCardSelect
              account={selectedAccount}
              onPress={() => {
                Keyboard.dismiss()
                accountSheetRef.current?.expand()
              }}
              placeholder={t("finance.budgets.mobile.anyAccountPlaceholder")}
              subtitle={t("finance.budgets.mobile.anyAccountSubtitle")}
            />
          </Card>

          {/* Color & Icon Customization Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>
              {t("finance.budgets.mobile.appearanceSection").toUpperCase()}
            </Text>

            {/* Color Palette */}
            <Text style={styles.fieldSubLabel}>
              {t("finance.budgets.mobile.colorAccent")}
            </Text>
            <FormColorPicker
              control={control}
              name="color"
              getColorHex={(c) => getBudgetColors(c).bar}
              containerStyle={{ marginBottom: 18 }}
            />

            {/* Category Icon */}
            <View style={styles.iconHeaderRow}>
              <Text style={styles.fieldSubLabel}>
                {t("finance.budgets.mobile.categoryIcon")}
              </Text>
              <View
                style={[
                  styles.iconPreviewBadge,
                  {
                    backgroundColor: activeColorMeta.bg,
                    borderColor: activeColorMeta.border,
                  },
                ]}
              >
                <BudgetCategoryIcon
                  icon={icon}
                  size={18}
                  color={activeColorMeta.bar}
                />
                <Text
                  style={[
                    styles.iconPreviewText,
                    { color: activeColorMeta.text },
                  ]}
                >
                  {icon}
                </Text>
              </View>
            </View>

            <View style={styles.iconGrid}>
              {Object.keys(BUDGET_ICONS).map((iconSlug) => {
                const IconComp = BUDGET_ICONS[iconSlug]
                const isSelected = icon === iconSlug
                return (
                  <TouchableOpacity
                    key={iconSlug}
                    onPress={() => {
                      haptics.selection()
                      setValue("icon", iconSlug, { shouldValidate: true })
                    }}
                    style={[
                      styles.iconGridItem,
                      isSelected && [
                        styles.iconGridItemActive,
                        {
                          backgroundColor: activeColorMeta.bg,
                          borderColor: activeColorMeta.bar,
                        },
                      ],
                    ]}
                  >
                    <IconComp
                      size={20}
                      color={
                        isSelected ? activeColorMeta.bar : colors.textMuted
                      }
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
          </Card>

          {/* Action Footer */}
          <View style={styles.actionFooter}>
            <Button
              onPress={handleSubmit(onValid)}
              loading={isSaving}
              variant="primary"
              size="lg"
            >
              {isEditMode
                ? t("finance.budgets.sheet.editSubmit")
                : t("finance.budgets.mobile.createSubmit")}
            </Button>

            {isEditMode && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                style={styles.deleteBtn}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <>
                    <Trash2 size={16} color={colors.destructive} />
                    <Text style={styles.deleteBtnText}>
                      {t("finance.budgets.mobile.menuDelete")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Currency Picker Bottom Sheet */}
      <CurrencyPickerSheet
        ref={currencySheetRef}
        currencies={currencies}
        selectedCurrency={currency}
        onSelect={(cur) => {
          setValue("currency", cur, { shouldValidate: true })
          currencySheetRef.current?.close()
        }}
      />

      {/* Account Picker Bottom Sheet */}
      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        institutions={institutions}
        selectedAccountId={defaultAccountId}
        allowNoAccount={true}
        onSelect={(accId) => {
          setValue("defaultAccountId", accId, { shouldValidate: true })
          accountSheetRef.current?.close()
        }}
      />
    </>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  loadingContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  keyboardView: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  headerBtn: {
    padding: 8,
  },
  headerSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: t.colors.primary,
    borderRadius: t.radius.md,
  },
  headerSaveBtnText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.primaryForeground,
  },
  amountCard: {
    padding: 16,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  amountInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: "800" as const,
    marginRight: 6,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 0,
  },
  amountInputContainer: {
    flex: 1,
    marginVertical: 0,
  },
  amountInputWrapper: {
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 0,
  },
  amountInput: {
    fontSize: 32,
    fontWeight: "800" as const,
    padding: 0,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  currencySelectButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
    minWidth: 68,
  },
  currencySelectButtonDisabled: {
    opacity: 0.75,
    minWidth: 52,
  },
  currencySelectCode: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    flexShrink: 0,
  },
  errorText: {
    fontSize: 12,
    color: t.colors.destructive,
    marginTop: 6,
  },
  sectionCard: {
    padding: 16,
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  fieldSubLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
    marginBottom: 8,
  },
  fieldHelperText: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },
  intervalRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  intervalPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  intervalPillActive: {
    backgroundColor: t.colors.surfaceSubtle,
  },
  intervalPillText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  intervalPillTextActive: {
    fontWeight: "700" as const,
  },
  selectorRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  selectorLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    flex: 1,
  },
  selectorIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: t.colors.primarySubtle,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  selectorValueText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
    flex: 1,
  },
  selectorPlaceholder: {
    color: t.colors.textMuted,
    fontWeight: "400" as const,
  },
  iconHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 10,
  },
  iconPreviewBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: t.radius.full,
    borderWidth: 1,
  },
  iconPreviewText: {
    fontSize: 12,
    fontWeight: "600" as const,
    textTransform: "capitalize" as const,
  },
  iconGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  iconGridItem: {
    width: 44,
    height: 44,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: t.colors.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  iconGridItemActive: {
    borderWidth: 1.5,
  },
  actionFooter: {
    marginTop: 8,
    gap: 12,
  },
  deleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 14,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
    backgroundColor: t.colors.destructiveSubtle,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
  conversionPreviewWrap: {
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  conversionPreviewRow: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  conversionPreviewText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  conversionPreviewRate: {
    fontSize: 12,
    fontWeight: "400" as const,
    color: t.colors.textMuted,
  },
  conversionWarningRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.warningSubtle,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  conversionWarningText: {
    fontSize: 12,
    color: t.colors.warning,
    flex: 1,
  },
})
