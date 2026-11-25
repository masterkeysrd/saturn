import { useState, useRef, useMemo } from "react"
import {
  StyleSheet,
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
import { useSafeAreaInsets } from "react-native-safe-area-context"
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet"
import { X, Trash2, AlertTriangle, Pencil } from "lucide-react-native"
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
import { getLocalizedEnumLabel, type TranslationKey } from "@saturn/i18n"
import { useSpace } from "../../lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
} from "../../lib/theme"
import { haptics } from "../../lib/haptics"
import { AppBottomSheet } from "../../components/ui/bottom-sheet"
import { TextInput } from "../../components/ui/text-input"
import { HeroAmountInput } from "../../components/ui/amount-input"
import {
  FormPillGroup,
  FormColorPicker,
} from "../../components/ui/form-primitives"
import { Button } from "../../components/ui/button"
import { useToast } from "../../components/ui/toast"
import { BUDGET_ICONS, BudgetCategoryIcon } from "../../lib/budget-icons"
import {
  CurrencyPickerSheet,
  AccountPickerSheet,
} from "../../components/finance/sheets"
import { AccountCardSelect } from "../../components/finance/account-select"

function getBudgetIconLabelKey(slug: string): TranslationKey {
  const camel = slug.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())
  return `finance.budgets.icons.${camel}` as TranslationKey
}

export default function ManageBudgetModal() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { activeSpaceId } = useSpace()
  const { id: editBudgetId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editBudgetId)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { t, locale } = useI18n()
  const { colors, getBudgetColors } = useTheme()
  const styles = useThemedStyles(createStyles)

  const currencySheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)
  const appearanceSheetRef = useRef<BottomSheet>(null)
  const [isAppearanceOpen, setIsAppearanceOpen] = useState(false)

  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

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

  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions: Account_InstitutionInfo[] = instData?.institutions || []

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

  const openAppearancePicker = () => {
    Keyboard.dismiss()
    haptics.light()
    setIsAppearanceOpen(true)
    appearanceSheetRef.current?.expand()
  }

  const closeAppearancePicker = () => {
    setIsAppearanceOpen(false)
    appearanceSheetRef.current?.close()
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
                unstable_headerRightItems: () => [],
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
                headerRight: () => null,
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
          showsVerticalScrollIndicator={false}
        >
          {/* Top Identity Row: [48x48 Categorical Icon Badge] + Clean Budget Name Input */}
          <View style={styles.identitySection}>
            <TouchableOpacity
              testID="budget-appearance-trigger"
              accessibilityRole="button"
              accessibilityLabel={t("finance.budgets.mobile.appearanceSection")}
              activeOpacity={0.75}
              onPress={openAppearancePicker}
              style={[
                styles.appearanceTrigger,
                {
                  backgroundColor: activeColorMeta.bg,
                  borderColor: activeColorMeta.border,
                },
              ]}
            >
              <BudgetCategoryIcon
                icon={icon}
                size={22}
                color={activeColorMeta.bar}
              />
              <View
                style={[
                  styles.appearanceBadgeDot,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Pencil size={9} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <View style={styles.nameInputColumn}>
              <TextInput
                control={control}
                name="name"
                label={t("finance.budgets.sheet.nameLabel")}
                placeholder={t("finance.budgets.mobile.namePlaceholder")}
                placeholderTextColor={colors.textMuted}
                inputContainerStyle={styles.nameInputWrapper}
                style={styles.nameInput}
              />
            </View>
          </View>

          {/* Target Limit Section (Flat on sheet canvas, hairline top) */}
          <View style={styles.hairlineSection}>
            <HeroAmountInput
              control={control}
              name="limit"
              label={t("finance.budgets.mobile.heroLabel")}
              currency={currency}
              currencySymbol={getCurrencySymbol(currency)}
              currencyDisabled={isEditMode}
              onPressCurrency={() => {
                haptics.light()
                currencySheetRef.current?.expand()
              }}
              accentColor={activeColorMeta.bar}
              containerStyle={styles.heroAmountFlat}
            />

            {currency !== baseCurrency && conversion ? (
              <View style={styles.conversionInlineWrap}>
                {"amount" in conversion ? (
                  <Text style={styles.conversionInlineText}>
                    ≈{" "}
                    {formatAmount(
                      Math.round(conversion.amount * 100),
                      baseCurrency
                    )}{" "}
                    <Text style={styles.conversionInlineRate}>
                      (1 {currency} = {conversion.rate.toFixed(4)}{" "}
                      {baseCurrency})
                    </Text>
                  </Text>
                ) : (
                  <View style={styles.conversionWarningInline}>
                    <AlertTriangle size={13} color={colors.warning} />
                    <Text style={styles.conversionWarningText}>
                      {conversion.error}
                    </Text>
                  </View>
                )}
              </View>
            ) : null}
          </View>

          {/* Period / Recurrence Interval Section */}
          <View style={styles.hairlineSection}>
            <Text style={styles.fieldLabel}>
              {t("finance.budgets.mobile.recurrenceFrequency")}
            </Text>
            {isEditMode ? (
              <>
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
                <Text style={styles.fieldHelperText}>
                  {t("finance.budgets.sheet.intervalLockedHelper")}
                </Text>
              </>
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
                pillStyle={styles.intervalGroupPill}
              />
            )}
          </View>

          {/* Default Account Section */}
          <View style={styles.hairlineSection}>
            <Text style={styles.fieldLabel}>
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
          </View>

          {/* Edit Mode: Limit Propagation Rule */}
          {isEditMode ? (
            <View style={styles.hairlineSection}>
              <Text style={styles.fieldLabel}>
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
                          {
                            borderColor: activeColorMeta.bar,
                            backgroundColor: activeColorMeta.bg,
                          },
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
            </View>
          ) : null}

          {/* Edit Mode: Lifecycle Status */}
          {isEditMode ? (
            <View style={styles.hairlineSection}>
              <Text style={styles.fieldLabel}>
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
                pillStyle={styles.intervalGroupPill}
              />
              <Text style={styles.fieldHelperText}>
                {status === "ACTIVE"
                  ? t("finance.budgets.mobile.statusHelperActive")
                  : status === "PAUSED"
                    ? t("finance.budgets.mobile.statusHelperPaused")
                    : t("finance.budgets.mobile.statusHelperClosed")}
              </Text>
            </View>
          ) : null}

          {/* Edit Mode: Delete Action */}
          {isEditMode ? (
            <View style={styles.hairlineSection}>
              <TouchableOpacity
                testID="budget-delete-button"
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
            </View>
          ) : null}
        </ScrollView>

        {/* Single Pinned Sticky Footer */}
        <View
          style={[
            styles.stickyFooter,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <Button
            testID="budget-save-button"
            onPress={handleSubmit(onValid)}
            loading={isSaving}
            variant="primary"
            style={styles.saveBtn}
          >
            {isEditMode
              ? t("finance.budgets.sheet.editSubmit")
              : t("finance.budgets.mobile.createSubmit")}
          </Button>
        </View>
      </KeyboardAvoidingView>

      {/* Appearance Picker Bottom Sheet */}
      <AppBottomSheet
        ref={appearanceSheetRef}
        title={t("finance.budgets.mobile.appearanceSection")}
        snapPoints={["62%"]}
        onClose={() => setIsAppearanceOpen(false)}
      >
        {isAppearanceOpen ? (
          <BottomSheetScrollView
            testID="budget-appearance-picker"
            contentContainerStyle={[
              styles.appearanceSheetContent,
              { paddingBottom: Math.max(insets.bottom, 24) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>
              {t("finance.budgets.mobile.colorAccent")}
            </Text>
            <FormColorPicker
              control={control}
              name="color"
              getColorHex={(c) => getBudgetColors(c).bar}
              containerStyle={styles.colorPickerWrap}
            />

            <View style={styles.appearanceDivider} />

            <Text style={styles.fieldLabel}>
              {t("finance.budgets.mobile.categoryIcon")}
            </Text>
            <View style={styles.iconGrid}>
              {Object.keys(BUDGET_ICONS).map((iconSlug) => {
                const isSelected = icon === iconSlug
                return (
                  <TouchableOpacity
                    key={iconSlug}
                    testID={`budget-icon-option-${iconSlug}`}
                    accessibilityRole="button"
                    accessibilityLabel={t(getBudgetIconLabelKey(iconSlug))}
                    onPress={() => {
                      haptics.selection()
                      setValue("icon", iconSlug, { shouldValidate: true })
                      closeAppearancePicker()
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
                    <BudgetCategoryIcon
                      icon={iconSlug}
                      size={20}
                      color={
                        isSelected ? activeColorMeta.bar : colors.textMuted
                      }
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
          </BottomSheetScrollView>
        ) : null}
      </AppBottomSheet>

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
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
  },
  headerBtn: {
    padding: 8,
  },
  identitySection: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 12,
    paddingBottom: 16,
  },
  appearanceTrigger: {
    width: 48,
    height: 48,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginTop: 22,
    position: "relative" as const,
    flexShrink: 0,
  },
  appearanceBadgeDot: {
    position: "absolute" as const,
    right: -4,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  nameInputColumn: {
    flex: 1,
    minWidth: 0,
  },
  nameInputWrapper: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.colors.border,
    borderRadius: 0,
    paddingHorizontal: 0,
    minHeight: 42,
  },
  nameInput: {
    fontSize: 18,
    fontWeight: "600" as const,
    paddingVertical: 6,
  },
  hairlineSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    paddingVertical: 16,
  },
  heroAmountFlat: {
    backgroundColor: "transparent",
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 0,
  },
  conversionInlineWrap: {
    marginTop: 8,
  },
  conversionInlineText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textSecondary,
  },
  conversionInlineRate: {
    fontSize: 12,
    fontWeight: "400" as const,
    color: t.colors.textMuted,
  },
  conversionWarningInline: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  conversionWarningText: {
    fontSize: 12,
    color: t.colors.warning,
    flex: 1,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500" as const,
    color: t.colors.textSecondary,
    marginBottom: 10,
  },
  fieldHelperText: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 8,
    lineHeight: 16,
  },
  intervalGroupPill: {
    flex: 1,
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
  deleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 13,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.destructiveBorder,
    backgroundColor: t.colors.destructiveSubtle,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
  stickyFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: t.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
  },
  saveBtn: {
    height: 48,
    width: "100%" as const,
  },
  appearanceSheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  colorPickerWrap: {
    marginBottom: 16,
  },
  appearanceDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.colors.border,
    marginBottom: 16,
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
})
