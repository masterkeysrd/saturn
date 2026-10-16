import { useRef, useMemo } from "react"
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
import { useCurrencyConversionPreview } from "@saturn/hooks/finance"
import { useSpace } from "@/lib/space-context"
import { theme, getNativeBudgetColors } from "@/lib/theme"
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
import { invalidateFinanceQueries } from "@/components/finance/finance-utils"

export default function ManageRecurringModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editRecurringId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editRecurringId)
  const queryClient = useQueryClient()
  const toast = useToast()

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
          title: "Template Updated",
          message: `"${values.name.trim()}" was updated.`,
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
          title: "Template Created",
          message: `"${values.name.trim()}" has been set up.`,
          type: "success",
        })
      }

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: isEditMode ? "Update Failed" : "Create Failed",
        message: err?.message || "Could not save recurring template.",
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!existingRecurring || !editRecurringId) return
    const recurringName = getValues("name")
    haptics.warning()

    Alert.alert(
      "Delete Recurring Template",
      `Are you sure you want to delete "${recurringName}"? Future scheduled instances will no longer be generated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
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
                title: "Template Deleted",
                message: `"${recurringName}" was deleted.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete template.",
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
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode ? "Edit Recurring" : "New Recurring",
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
        style={{ flex: 1, backgroundColor: theme.colors.background }}
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
                  type === "EXPENSE"
                    ? theme.colors.destructive
                    : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.segmentText,
                  type === "EXPENSE" && styles.segmentTextActiveExpense,
                ]}
              >
                Expense / Bill
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
                color={
                  type === "INCOME"
                    ? theme.colors.success
                    : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.segmentText,
                  type === "INCOME" && styles.segmentTextActiveIncome,
                ]}
              >
                Income / Salary
              </Text>
            </TouchableOpacity>
          </View>

          {/* Template Name */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>TEMPLATE NAME *</Text>
            <TextInput
              control={control}
              name="name"
              placeholder={
                type === "EXPENSE"
                  ? "e.g., Netflix, Office Rent, Electricity"
                  : "e.g., Monthly Salary, Client Retainer"
              }
              style={styles.textInput}
            />
          </Card>

          {/* Amount & Currency */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>AMOUNT & CURRENCY *</Text>
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
                <ChevronRight size={14} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {conversionPreview !== null ? (
              <View style={styles.conversionBadge}>
                <Sparkles size={13} color={theme.colors.textSecondary} />
                <Text style={styles.conversionText}>
                  ≈ {conversionPreview.toFixed(2)} {baseCurrency} (Base)
                </Text>
              </View>
            ) : null}
          </Card>

          {/* Recurrence Interval */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>FREQUENCY *</Text>
            <FormPillGroup
              control={control}
              name="interval"
              options={RECURRING_INTERVAL_OPTIONS.map((opt) => ({
                label: opt.label,
                value: opt.value as RecurringTransaction_Interval,
                icon: <Clock size={14} color={theme.colors.primary} />,
              }))}
            />
          </Card>

          {/* Next Due Date / Start Date */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>NEXT DUE DATE *</Text>
            <FormDateRow
              control={control}
              name="nextDueDate"
              label="Target execution schedule"
              title="Select Due Date"
              icon={<Calendar size={18} color={theme.colors.primary} />}
              containerStyle={{ paddingHorizontal: 0, paddingVertical: 6 }}
            />
          </Card>

          {/* Budget Category (Required if EXPENSE) */}
          {type === "EXPENSE" ? (
            <Card style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>BUDGET CATEGORY *</Text>
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
                      const colors = getNativeBudgetColors(
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
                            { backgroundColor: colors.bg },
                          ]}
                        >
                          <IconComp size={16} color={colors.text} />
                        </View>
                      )
                    })()
                  ) : (
                    <View style={styles.pickerIconWrapper}>
                      <Tag size={18} color={theme.colors.textMuted} />
                    </View>
                  )}
                  <View>
                    <Text
                      style={[
                        styles.pickerValueText,
                        !selectedBudget && { color: theme.colors.textMuted },
                      ]}
                    >
                      {selectedBudget?.name || "Select Budget Category"}
                    </Text>
                    <Text style={styles.pickerHintText}>
                      Tracks spending against allocation
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {errors.budgetId ? (
                <Text style={styles.errorText}>{errors.budgetId.message}</Text>
              ) : null}
            </Card>
          ) : null}

          {/* Account Mapping (Optional) */}
          <Card style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {type === "EXPENSE" ? "PAY FROM ACCOUNT" : "DEPOSIT TO ACCOUNT"}{" "}
              (OPTIONAL)
            </Text>
            <AccountCardSelect
              account={selectedAccount}
              onPress={() => {
                Keyboard.dismiss()
                accountSheetRef.current?.expand()
              }}
              placeholder="None (Choose when confirming)"
              subtitle="Default linked payment method"
            />
          </Card>

          {/* Options: Variable amount & Grace period */}
          <Card style={styles.fieldCard}>
            <FormSwitchRow
              control={control}
              name="isVariable"
              label="Variable Amount"
              subtitle="Amount fluctuates each billing cycle (e.g. utility bills)"
              containerStyle={{ paddingHorizontal: 0, paddingVertical: 4 }}
            />

            <View style={styles.divider} />

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>Grace Period</Text>
                <Text style={styles.toggleDescription}>
                  Days allowed past due date before marking overdue
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
                  <Text style={styles.toggleTitle}>Template Active</Text>
                  <Text style={styles.toggleDescription}>
                    Paused templates do not generate new scheduled cycles
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
                    false: theme.colors.surfaceElevated,
                    true: theme.colors.primary,
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
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.destructive}
                  />
                ) : (
                  <>
                    <Trash2 size={16} color={theme.colors.destructive} />
                    <Text style={styles.deleteBtnText}>
                      Delete Recurring Template
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
    gap: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerSaveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
  },
  headerSaveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.primary,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    padding: 4,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    gap: 6,
  },
  segmentBtnActiveExpense: {
    backgroundColor: theme.colors.destructiveSubtle,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
  },
  segmentBtnActiveIncome: {
    backgroundColor: theme.colors.successSubtle,
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.3)",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  segmentTextActiveExpense: {
    color: theme.colors.destructive,
  },
  segmentTextActiveIncome: {
    color: theme.colors.success,
  },
  fieldCard: {
    padding: 16,
    gap: 12,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: theme.colors.textMuted,
    letterSpacing: 0.5,
  },
  textInput: {
    fontSize: 15,
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  amountInputWrapper: {
    flex: 1,
  },
  amountInput: {
    fontSize: 22,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  currencyPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  currencyPillText: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  conversionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    alignSelf: "flex-start",
  },
  conversionText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  frequencyRow: {
    flexDirection: "row",
    gap: 8,
  },
  frequencyChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6,
  },
  frequencyChipActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  frequencyChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  frequencyChipTextActive: {
    color: theme.colors.primary,
  },
  pickerSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  pickerSelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  pickerIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  budgetIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerValueText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  pickerHintText: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textPrimary,
  },
  toggleDescription: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  graceChipsRow: {
    flexDirection: "row",
    gap: 6,
  },
  graceChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  graceChipActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  graceChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  graceChipTextActive: {
    color: theme.colors.primary,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 4,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 8,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.destructive,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    marginTop: -4,
  },
})
