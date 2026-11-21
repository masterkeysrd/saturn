import { useRef, useMemo } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Switch,
  Keyboard,
} from "react-native"
import { useRouter, useLocalSearchParams, Stack } from "expo-router"
import { useQueryClient } from "@tanstack/react-query"
import BottomSheet from "@gorhom/bottom-sheet"
import {
  X,
  Calendar,
  ChevronRight,
  Trash2,
  ArrowDownLeft,
  ArrowUpRight,
  Tag,
  Clock,
  Sparkles,
} from "lucide-react-native"
import {
  useCreateRecurringTransactionMutation,
  useUpdateRecurringTransactionMutation,
  useDeleteRecurringTransactionMutation,
  useListRecurringTransactionsQuery,
  useListCurrenciesQuery,
  useListBudgetsQuery,
  useListAccountsQuery,
  useGetSettingsQuery,
  type RecurringTransaction,
  type RecurringTransaction_Interval,
  type RecurringTransaction_Status,
  type Budget,
  type Account,
  type CurrencyInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  RecurringTransactionSchema,
  type RecurringTransactionFormValues,
} from "@saturn/schemas"
import {
  toCentsString,
  formatCents,
  RECURRING_INTERVAL_OPTIONS,
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
import { useToast } from "@/components/ui/toast"
import { getBudgetIcon } from "@/lib/budget-icons"
import { toLocalISODate } from "@/components/ui/date-picker-sheet"
import {
  FormDateRow,
  FormPillGroup,
  FormSwitchRow,
} from "@/components/ui/form-primitives"
import {
  BudgetPickerSheet,
  CurrencyPickerSheet,
  AccountPickerSheet,
} from "@/components/finance/sheets"
import { AccountCardSelect } from "@/components/finance/account-select"

export default function ManageRecurringModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editRecurringId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editRecurringId)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { t, locale } = useI18n()
  const { colors, getBudgetColors } = useTheme()
  const styles = useThemedStyles(createStyles)

  // Sheet references
  const currencySheetRef = useRef<BottomSheet>(null)
  const budgetSheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)

  // 1. Settings & Base Currency
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // 2. Fetch Currencies, Budgets, and Accounts
  const { data: currenciesData } = useListCurrenciesQuery(
    {},
    { enabled: !!activeSpaceId, staleTime: 1000 * 60 * 30 }
  )
  const currencies: CurrencyInfo[] = currenciesData?.currencies || []

  const { data: budgetsData, isLoading: isBudgetsLoading } =
    useListBudgetsQuery(
      { pageSize: 100, pageToken: "", view: "FULL" },
      { enabled: !!activeSpaceId }
    )
  const budgets: Budget[] = useMemo(
    () => budgetsData?.budgets || [],
    [budgetsData?.budgets]
  )

  const { data: accountsData } = useListAccountsQuery(
    { activeOnly: true },
    { enabled: !!activeSpaceId }
  )
  const accounts: Account[] = useMemo(
    () => accountsData?.accounts || [],
    [accountsData?.accounts]
  )

  // 3. Fetch recurring templates if edit mode
  const { data: recurringData, isLoading: isRecurringLoading } =
    useListRecurringTransactionsQuery(
      { pageSize: 100, pageToken: "", status: "STATUS_UNSPECIFIED" },
      { enabled: !!activeSpaceId }
    )
  const existingRecurring = useMemo(() => {
    if (!editRecurringId) return null
    return (
      recurringData?.recurringTransactions?.find(
        (t) => t.id === editRecurringId
      ) || null
    )
  }, [recurringData, editRecurringId])

  const defaultFormValues: RecurringTransactionFormValues = useMemo(() => {
    if (existingRecurring) {
      const d = existingRecurring.executionState?.nextDueDate
        ? new Date(existingRecurring.executionState.nextDueDate)
        : new Date()

      return {
        type: existingRecurring.type === "INCOME" ? "INCOME" : "EXPENSE",
        name: existingRecurring.name || "",
        amount: formatCents(existingRecurring.amount).toString(),
        currency: existingRecurring.currency || baseCurrency,
        interval: (existingRecurring.interval ||
          "MONTHLY") as RecurringTransaction_Interval,
        budgetId: existingRecurring.budgetId || "",
        accountId: existingRecurring.accountId || "",
        isVariable: existingRecurring.isVariable || false,
        gracePeriodDays: existingRecurring.gracePeriodDays ?? 3,
        status: (existingRecurring.status ||
          "ACTIVE") as RecurringTransaction_Status,
        nextDueDate: !isNaN(d.getTime()) ? d : new Date(),
      }
    }
    return {
      type: "EXPENSE",
      name: "",
      amount: "",
      currency: baseCurrency,
      interval: "MONTHLY",
      nextDueDate: new Date(),
      budgetId: budgets.length > 0 ? budgets[0].id || "" : "",
      accountId: "",
      isVariable: false,
      gracePeriodDays: 3,
      status: "ACTIVE",
    }
  }, [existingRecurring, budgets, baseCurrency])

  // RHF Form
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RecurringTransactionFormValues>({
    resolver: zodResolver(RecurringTransactionSchema),
    defaultValues: defaultFormValues,
    values: defaultFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  // Watch only discrete selector and preview fields
  const [
    type = "EXPENSE",
    currency = baseCurrency,
    budgetId = "",
    accountId = "",
    status = "ACTIVE" as RecurringTransaction_Status,
    amount = "",
  ] = useWatch({
    control,
    name: [
      "type",
      "currency",
      "budgetId",
      "accountId",
      "status",
      "amount",
    ] as const,
  })

  // Multi-currency preview
  const { getConversionPreview } = useCurrencyConversionPreview({
    spaceId: activeSpaceId || undefined,
    enabled: !!activeSpaceId,
    baseCurrency,
  })

  const conversionPreview = useMemo(() => {
    if (!currency || currency === baseCurrency || !amount) return null
    const preview = getConversionPreview(amount, currency)
    if (preview && "amount" in preview && typeof preview.amount === "number") {
      return preview.amount
    }
    return null
  }, [amount, currency, baseCurrency, getConversionPreview])

  // Mutations
  const createMutation = useCreateRecurringTransactionMutation()
  const updateMutation = useUpdateRecurringTransactionMutation()
  const deleteMutation = useDeleteRecurringTransactionMutation()

  const isSaving =
    createMutation.isPending || updateMutation.isPending || isSubmitting
  const isDeleting = deleteMutation.isPending

  // Selected entities for display
  const selectedBudget = useMemo(
    () => budgets.find((b) => b.id === budgetId),
    [budgets, budgetId]
  )
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  )

  const onValid = async (values: RecurringTransactionFormValues) => {
    haptics.light()

    try {
      const centsAmount = toCentsString(values.amount)
      const nextDueDateIso = toLocalISODate(values.nextDueDate)

      if (isEditMode && editRecurringId) {
        await updateMutation.mutateAsync({
          id: editRecurringId,
          req: {
            id: editRecurringId,
            version: existingRecurring?.version,
            recurringTransaction: {
              ...existingRecurring,
              type: values.type,
              name: values.name.trim(),
              amount: centsAmount,
              currency: values.currency,
              interval: values.interval,
              executionState: {
                ...existingRecurring?.executionState,
                nextDueDate: nextDueDateIso,
              },
              budgetId: values.type === "EXPENSE" ? values.budgetId : undefined,
              accountId: values.accountId || undefined,
              isVariable: values.isVariable,
              gracePeriodDays: values.gracePeriodDays,
              status: values.status,
            } as RecurringTransaction,
          },
        })
        haptics.success()
        toast.show({
          title: t("finance.recurring.mobile.toastUpdatedTitle"),
          message: t("finance.recurring.mobile.toastUpdatedDesc", {
            name: values.name.trim(),
          }),
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          recurringTransaction: {
            type: values.type,
            name: values.name.trim(),
            amount: centsAmount,
            currency: values.currency,
            interval: values.interval,
            executionState: {
              nextDueDate: nextDueDateIso,
            },
            budgetId: values.type === "EXPENSE" ? values.budgetId : undefined,
            accountId: values.accountId || undefined,
            isVariable: values.isVariable,
            gracePeriodDays: values.gracePeriodDays,
            status: "ACTIVE",
          } as RecurringTransaction,
        })
        haptics.success()
        toast.show({
          title: t("finance.recurring.mobile.toastCreatedTitle"),
          message: t("finance.recurring.mobile.toastCreatedDesc", {
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
        title: isEditMode
          ? t("finance.recurring.sheet.updateFailed")
          : t("finance.recurring.sheet.createFailed"),
        message: err?.message || t("finance.recurring.mobile.toastSaveFailed"),
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!existingRecurring || !editRecurringId) return
    const recurringName = getValues("name")
    haptics.warning()

    Alert.alert(
      t("finance.recurring.mobile.deleteTitle"),
      t("finance.recurring.mobile.deleteDesc", { name: recurringName }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: editRecurringId,
                req: {
                  id: editRecurringId,
                  version: existingRecurring.version,
                },
              })
              haptics.success()
              toast.show({
                title: t("finance.recurring.delete.deletedTitle"),
                message: t("finance.recurring.mobile.toastDeletedDesc", {
                  name: recurringName,
                }),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: t("finance.recurring.mobile.toastDeleteFailed"),
                message:
                  err?.message ||
                  t("finance.recurring.delete.failedDescription"),
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  if (isEditMode && isRecurringLoading && !existingRecurring) {
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
            ? t("finance.recurring.mobile.headerTitleEdit")
            : t("finance.recurring.mobile.newRecurring"),
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
        style={{ flex: 1, backgroundColor: colors.background }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type Selector (Expense vs Income) */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[
                styles.segmentBtn,
                type === "EXPENSE" && styles.segmentBtnActiveExpense,
              ]}
              onPress={() => {
                haptics.selection()
                setValue("type", "EXPENSE", { shouldValidate: true })
              }}
              activeOpacity={0.8}
            >
              <ArrowUpRight
                size={16}
                color={
                  type === "EXPENSE" ? colors.destructive : colors.textMuted
                }
              />
              <Text
                style={[
                  styles.segmentText,
                  type === "EXPENSE" && styles.segmentTextActiveExpense,
                ]}
              >
                {t("finance.recurring.mobile.segExpense")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.segmentBtn,
                type === "INCOME" && styles.segmentBtnActiveIncome,
              ]}
              onPress={() => {
                haptics.selection()
                setValue("type", "INCOME", { shouldValidate: true })
              }}
              activeOpacity={0.8}
            >
              <ArrowDownLeft
                size={16}
                color={type === "INCOME" ? colors.success : colors.textMuted}
              />
              <Text
                style={[
                  styles.segmentText,
                  type === "INCOME" && styles.segmentTextActiveIncome,
                ]}
              >
                {t("finance.recurring.mobile.segIncome")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Template Name */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {t("finance.recurring.sheet.nameLabel").toUpperCase()} *
            </Text>
            <TextInput
              control={control}
              name="name"
              placeholder={
                type === "EXPENSE"
                  ? t("finance.recurring.sheet.namePlaceholderExpense")
                  : t("finance.recurring.sheet.namePlaceholderIncome")
              }
              style={styles.textInput}
            />
          </Card>

          {/* Amount & Currency */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {t("finance.recurring.mobile.amountCurrencyLabel").toUpperCase()}{" "}
              *
            </Text>
            <View style={styles.amountRow}>
              <View style={styles.amountInputWrapper}>
                <TextInput
                  control={control}
                  name="amount"
                  placeholder="0.00"
                  keyboardType="decimal-pad"
                  style={styles.amountInput}
                />
              </View>
              <TouchableOpacity
                style={styles.currencyPill}
                onPress={() => {
                  haptics.light()
                  currencySheetRef.current?.expand()
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.currencyPillText}>{currency}</Text>
                <ChevronRight size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {conversionPreview !== null ? (
              <View style={styles.conversionBadge}>
                <Sparkles size={13} color={colors.textSecondary} />
                <Text style={styles.conversionText}>
                  {t("finance.recurring.mobile.conversionBase", {
                    amount: conversionPreview.toFixed(2),
                    currency: baseCurrency,
                  })}
                </Text>
              </View>
            ) : null}
          </Card>

          {/* Recurrence Interval */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {t("finance.recurring.mobile.frequencyLabel").toUpperCase()} *
            </Text>
            <FormPillGroup
              control={control}
              name="interval"
              options={RECURRING_INTERVAL_OPTIONS.map((opt) => ({
                label: getLocalizedEnumLabel(
                  "finance",
                  "interval",
                  opt.value,
                  locale
                ),
                value: opt.value as RecurringTransaction_Interval,
                icon: <Clock size={14} color={colors.primary} />,
              }))}
            />
          </Card>

          {/* Next Due Date / Start Date */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {t("finance.recurring.sheet.nextDueDateLabel").toUpperCase()} *
            </Text>
            <FormDateRow
              control={control}
              name="nextDueDate"
              label={t("finance.recurring.mobile.dueDateRowLabel")}
              title={t("finance.recurring.mobile.selectDueDate")}
              icon={<Calendar size={18} color={colors.primary} />}
              containerStyle={{ paddingHorizontal: 0, paddingVertical: 6 }}
            />
          </Card>

          {/* Budget Category (Required if EXPENSE) */}
          {type === "EXPENSE" ? (
            <Card style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>
                {t(
                  "finance.recurring.mobile.budgetCategoryLabel"
                ).toUpperCase()}{" "}
                *
              </Text>
              <TouchableOpacity
                style={styles.pickerSelectorRow}
                onPress={() => {
                  haptics.light()
                  budgetSheetRef.current?.expand()
                }}
                activeOpacity={0.7}
              >
                <View style={styles.pickerSelectorLeft}>
                  {selectedBudget ? (
                    (() => {
                      const budgetPalette = getBudgetColors(
                        selectedBudget.color || "indigo"
                      )
                      const IconComp = getBudgetIcon(
                        selectedBudget.icon || "piggy-bank",
                        selectedBudget.name
                      )
                      return (
                        <View
                          style={[
                            styles.budgetIconCircle,
                            { backgroundColor: budgetPalette.bg },
                          ]}
                        >
                          <IconComp size={16} color={budgetPalette.text} />
                        </View>
                      )
                    })()
                  ) : (
                    <View style={styles.pickerIconWrapper}>
                      <Tag size={18} color={colors.textMuted} />
                    </View>
                  )}
                  <View>
                    <Text
                      style={[
                        styles.pickerValueText,
                        !selectedBudget && { color: colors.textMuted },
                      ]}
                    >
                      {selectedBudget?.name ||
                        t("finance.recurring.mobile.selectBudgetCategory")}
                    </Text>
                    <Text style={styles.pickerHintText}>
                      {t("finance.recurring.mobile.budgetTracksHint")}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color={colors.textMuted} />
              </TouchableOpacity>
              {errors.budgetId ? (
                <Text style={styles.errorText}>{errors.budgetId.message}</Text>
              ) : null}
            </Card>
          ) : null}

          {/* Account Mapping (Optional) */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {type === "EXPENSE"
                ? t("finance.recurring.mobile.payFromAccount")
                : t("finance.recurring.mobile.depositToAccount")}{" "}
              {t("finance.recurring.mobile.optionalSuffix").toUpperCase()}
            </Text>
            <AccountCardSelect
              account={selectedAccount}
              onPress={() => {
                Keyboard.dismiss()
                accountSheetRef.current?.expand()
              }}
              placeholder={t("finance.recurring.mobile.accountNonePlaceholder")}
              subtitle={t("finance.recurring.mobile.accountDefaultHint")}
            />
          </Card>

          {/* Options: Variable amount & Grace period */}
          <Card style={styles.fieldCard}>
            <FormSwitchRow
              control={control}
              name="isVariable"
              label={t("finance.recurring.mobile.variableAmount")}
              subtitle={t("finance.recurring.mobile.variableFluctuatesHint")}
              containerStyle={{ paddingHorizontal: 0, paddingVertical: 4 }}
            />

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>
                  {t("finance.recurring.mobile.gracePeriodTitle")}
                </Text>
                <Text style={styles.toggleDescription}>
                  {t("finance.recurring.mobile.gracePeriodDesc")}
                </Text>
              </View>
              <FormPillGroup
                control={control}
                name="gracePeriodDays"
                options={[
                  { label: "0d", value: 0 },
                  { label: "3d", value: 3 },
                  { label: "5d", value: 5 },
                  { label: "7d", value: 7 },
                ]}
                pillStyle={{ paddingHorizontal: 10, paddingVertical: 6 }}
              />
            </View>
          </Card>

          {/* Edit Mode: Status & Delete */}
          {isEditMode ? (
            <Card style={styles.fieldCard}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>
                    {t("finance.recurring.mobile.templateActiveTitle")}
                  </Text>
                  <Text style={styles.toggleDescription}>
                    {t("finance.recurring.mobile.templateActiveDesc")}
                  </Text>
                </View>
                <Switch
                  value={status === "ACTIVE"}
                  onValueChange={(active) => {
                    haptics.selection()
                    setValue("status", active ? "ACTIVE" : "PAUSED", {
                      shouldValidate: true,
                    })
                  }}
                  trackColor={{
                    false: colors.surfaceElevated,
                    true: colors.primary,
                  }}
                  thumbColor="#ffffff"
                />
              </View>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={handleDelete}
                disabled={isDeleting}
                activeOpacity={0.7}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color={colors.destructive} />
                ) : (
                  <>
                    <Trash2 size={16} color={colors.destructive} />
                    <Text style={styles.deleteBtnText}>
                      {t("finance.recurring.mobile.deleteTitle")}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </Card>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sheets */}
      <CurrencyPickerSheet
        ref={currencySheetRef}
        currencies={currencies}
        selectedCurrency={currency}
        onSelect={(code) =>
          setValue("currency", code, { shouldValidate: true })
        }
      />

      <BudgetPickerSheet
        ref={budgetSheetRef}
        budgets={budgets}
        selectedBudgetId={budgetId}
        isLoading={isBudgetsLoading}
        onSelect={(b) => {
          if (b.id) {
            setValue("budgetId", b.id, { shouldValidate: true })
            if (b.currency) {
              setValue("currency", b.currency, { shouldValidate: true })
            }
          }
        }}
      />

      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        selectedAccountId={accountId}
        onSelect={(id) => {
          setValue("accountId", id, { shouldValidate: true })
          accountSheetRef.current?.close()
        }}
      />
    </>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: t.colors.background,
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.primarySubtle,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  headerSaveBtnText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.primary,
  },
  segmentedControl: {
    flexDirection: "row" as const,
    backgroundColor: t.colors.surface,
    padding: 4,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 10,
    borderRadius: t.radius.md,
    gap: 6,
  },
  segmentBtnActiveExpense: {
    backgroundColor: t.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
  },
  segmentBtnActiveIncome: {
    backgroundColor: t.colors.successSubtle,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  segmentTextActiveExpense: {
    color: t.colors.destructive,
  },
  segmentTextActiveIncome: {
    color: t.colors.success,
  },
  fieldCard: {
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.5,
  },
  textInput: {
    fontSize: 15,
  },
  amountRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  amountInputWrapper: {
    flex: 1,
  },
  amountInput: {
    fontSize: 22,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  currencyPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 6,
  },
  currencyPillText: {
    fontSize: 14,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  conversionBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceElevated,
    alignSelf: "flex-start" as const,
  },
  conversionText: {
    fontSize: 12,
    color: t.colors.textSecondary,
    fontWeight: "500" as const,
  },
  frequencyRow: {
    flexDirection: "row" as const,
    gap: 8,
  },
  frequencyChip: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: t.radius.md,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
    gap: 6,
  },
  frequencyChipActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  frequencyChipText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  frequencyChipTextActive: {
    color: t.colors.primary,
  },
  pickerSelectorRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingVertical: 8,
  },
  pickerSelectorLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    flex: 1,
  },
  pickerIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surfaceElevated,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  budgetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  pickerValueText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  pickerHintText: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    gap: 16,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.textPrimary,
  },
  toggleDescription: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  graceChipsRow: {
    flexDirection: "row" as const,
    gap: 6,
  },
  graceChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: t.radius.sm,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  graceChipActive: {
    backgroundColor: t.colors.primarySubtle,
    borderColor: t.colors.primary,
  },
  graceChipText: {
    fontSize: 12,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  graceChipTextActive: {
    color: t.colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: t.colors.border,
    marginVertical: 4,
  },
  deleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    paddingVertical: 10,
    gap: 8,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600" as const,
    color: t.colors.destructive,
  },
  errorText: {
    fontSize: 12,
    color: t.colors.destructive,
    marginTop: -4,
  },
})
