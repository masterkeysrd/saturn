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
import BottomSheet from "@gorhom/bottom-sheet"
import { X, Trash2 } from "lucide-react-native"
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
import { budgetSchema, type BudgetFormValues } from "@saturn/schemas"
import {
  toCentsString,
  formatCents,
  getCurrencySymbol,
  BUDGET_INTERVAL_OPTIONS as INTERVAL_OPTIONS,
  PROPAGATION_OPTIONS,
} from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
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
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

export default function ManageBudgetModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editBudgetId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editBudgetId)
  const queryClient = useQueryClient()
  const toast = useToast()

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
    resolver: zodResolver(budgetSchema),
    defaultValues: defaultFormValues,
    values: defaultFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  const [propagation, setPropagation] = useState<LimitPropagation>(
    "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
  )

  // Watch only discrete selector fields
  const [
    color = "indigo",
    currency = baseCurrency,
    interval = "MONTHLY" as Budget_RecurrenceInterval,
    status = "ACTIVE" as Budget_Status,
    icon = "piggy-bank",
    defaultAccountId = "",
  ] = useWatch({
    control,
    name: [
      "color",
      "currency",
      "interval",
      "status",
      "icon",
      "defaultAccountId",
    ] as const,
  })

  // Mutations
  const createMutation = useCreateBudgetMutation()
  const updateMutation = useUpdateBudgetMutation()
  const deleteMutation = useDeleteBudgetMutation()

  const isSaving =
    createMutation.isPending || updateMutation.isPending || isSubmitting
  const isDeleting = deleteMutation.isPending

  const activeColorMeta = getNativeBudgetColors(color)

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
          title: "Budget Updated",
          message: `"${values.name.trim()}" has been updated.`,
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
          title: "Budget Created",
          message: `"${values.name.trim()}" is now active.`,
          type: "success",
        })
      }

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: "Save Failed",
        message: err?.message || "Could not save budget allocation.",
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!editBudgetId) return
    const budgetName = getValues("name")
    haptics.warning()
    Alert.alert(
      "Delete Budget",
      `Are you sure you want to delete "${budgetName}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: editBudgetId,
                req: { id: editBudgetId },
              })
              haptics.success()
              toast.show({
                title: "Budget Deleted",
                message: `"${budgetName}" was deleted.`,
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
                title: "Delete Failed",
                message: err?.message || "Could not delete budget.",
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
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode ? "Edit Budget" : "New Budget",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleSubmit(onValid)}
              disabled={isSaving}
              style={[styles.headerSaveBtn, isSaving && { opacity: 0.6 }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Text style={styles.headerSaveBtnText}>Save</Text>
              )}
            </TouchableOpacity>
          ),
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
            label="BUDGET LIMIT AMOUNT"
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

          {/* Budget Name Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>BUDGET DETAILS</Text>
            <TextInput
              control={control}
              name="name"
              label="Budget Name"
              placeholder="e.g. Dining & Restaurants, Groceries, Rent"
              placeholderTextColor={theme.colors.textMuted}
              containerStyle={{ marginBottom: 16 }}
            />

            {/* Recurrence Interval */}
            <Text style={styles.fieldSubLabel}>Recurrence Frequency</Text>
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
                    {INTERVAL_OPTIONS.find((opt) => opt.value === interval)
                      ?.label || interval}
                  </Text>
                </View>
              </View>
            ) : (
              <FormPillGroup
                control={control}
                name="interval"
                options={INTERVAL_OPTIONS}
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
                  Limit Propagation Rule
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
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <Text style={styles.fieldHelperText}>
                  {propagation === "LIMIT_PROPAGATION_NEXT_PERIODS_ONLY"
                    ? "Applies to the current period and all future periods."
                    : "Applies limit modification only to the current active period."}
                </Text>
              </>
            )}

            {/* Lifecycle Status (Edit mode only) */}
            {isEditMode && (
              <>
                <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
                  Budget Status
                </Text>
                <FormPillGroup
                  control={control}
                  name="status"
                  options={[
                    {
                      value: "ACTIVE" as Budget_Status,
                      label: "Active",
                      activeBorder: activeColorMeta.bar,
                      activeBg: activeColorMeta.bg,
                      activeTextColor: activeColorMeta.text,
                    },
                    {
                      value: "PAUSED" as Budget_Status,
                      label: "Paused",
                      activeBorder: "#f59e0b",
                      activeBg: "rgba(245, 158, 11, 0.15)",
                      activeTextColor: "#f59e0b",
                    },
                    {
                      value: "CLOSED" as Budget_Status,
                      label: "Closed",
                      activeBorder: theme.colors.destructive,
                      activeBg: theme.colors.destructiveSubtle,
                      activeTextColor: theme.colors.destructive,
                    },
                  ]}
                  pillStyle={{ flex: 1 }}
                />
                <Text style={styles.fieldHelperText}>
                  {status === "ACTIVE"
                    ? "Budget is active and open for transaction allocations."
                    : status === "PAUSED"
                      ? "Budget is temporarily suspended. Transactions are blocked."
                      : "Budget is closed. Template is archived and no longer tracks expenses."}
                </Text>
              </>
            )}

            {/* Default Account Selector */}
            <Text style={[styles.fieldSubLabel, { marginTop: 16 }]}>
              Default Account (Optional)
            </Text>
            <AccountCardSelect
              account={selectedAccount}
              onPress={() => {
                Keyboard.dismiss()
                accountSheetRef.current?.expand()
              }}
              placeholder="None (Any Account)"
              subtitle="Any linked payment method"
            />
          </Card>

          {/* Color & Icon Customization Card */}
          <Card style={styles.sectionCard}>
            <Text style={styles.sectionHeaderLabel}>APPEARANCE</Text>

            {/* Color Palette */}
            <Text style={styles.fieldSubLabel}>Color Accent</Text>
            <FormColorPicker
              control={control}
              name="color"
              getColorHex={(c) => getNativeBudgetColors(c).bar}
              containerStyle={{ marginBottom: 18 }}
            />

            {/* Category Icon */}
            <View style={styles.iconHeaderRow}>
              <Text style={styles.fieldSubLabel}>Category Icon</Text>
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
                        isSelected
                          ? activeColorMeta.bar
                          : theme.colors.textMuted
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
              {isEditMode ? "Save Changes" : "Create Budget"}
            </Button>

            {isEditMode && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={isDeleting}
                style={styles.deleteBtn}
              >
                {isDeleting ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.destructive}
                  />
                ) : (
                  <>
                    <Trash2 size={16} color={theme.colors.destructive} />
                    <Text style={styles.deleteBtnText}>Delete Budget</Text>
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
        onSelect={(accId) => {
          setValue("defaultAccountId", accId, { shouldValidate: true })
          accountSheetRef.current?.close()
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  keyboardView: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
  },
  headerSaveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primaryForeground,
  },
  amountCard: {
    padding: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  amountInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: "800",
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
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minWidth: 68,
  },
  currencySelectButtonDisabled: {
    opacity: 0.75,
    minWidth: 52,
  },
  currencySelectCode: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    flexShrink: 0,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    marginTop: 6,
  },
  sectionCard: {
    padding: 16,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  fieldSubLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  fieldHelperText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 6,
    lineHeight: 16,
  },
  intervalRow: {
    flexDirection: "row",
    gap: 8,
  },
  intervalPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  intervalPillActive: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  intervalPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  intervalPillTextActive: {
    fontWeight: "700",
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  selectorIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(56, 189, 248, 0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectorValueText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    flex: 1,
  },
  selectorPlaceholder: {
    color: theme.colors.textMuted,
    fontWeight: "400",
  },
  iconHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  iconPreviewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.full,
    borderWidth: 1,
  },
  iconPreviewText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  iconGridItem: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGridItemActive: {
    borderWidth: 1.5,
  },
  actionFooter: {
    marginTop: 8,
    gap: 12,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
    backgroundColor: "rgba(244, 63, 94, 0.08)",
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.destructive,
  },
})
