import React, { useRef, useMemo } from "react"
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
import {
  X,
  Calendar,
  CalendarClock,
  Trash2,
  User,
  Phone,
  FileText,
  TrendingUp,
  TrendingDown,
  Landmark,
} from "lucide-react-native"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { BorrowingSchema, type BorrowingFormValues } from "@saturn/schemas"
import {
  useCreateBorrowingMutation,
  useUpdateBorrowingMutation,
  useDeleteBorrowingMutation,
  useGetBorrowingQuery,
  useListCurrenciesQuery,
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetSettingsQuery,
  type Borrowing,
  type Borrowing_Direction,
  type Account,
  type Account_InstitutionInfo,
  type CurrencyInfo,
} from "@saturn/api/saturn/finance/v1/finance"
import { formatCents, toCentsString } from "@saturn/core"
import { useSpace } from "@/lib/space-context"
import { theme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
  CurrencyPickerSheet,
  AccountPickerSheet,
} from "@/components/finance/sheets"
import { AccountRow } from "@/components/finance/account-select"
import {
  getCurrencySymbol,
  invalidateFinanceQueries,
} from "@/components/finance/finance-utils"
import { formStyles } from "@/components/finance/forms/form-styles"
import { HeroAmountInput } from "@/components/ui/amount-input"
import {
  FormRowInput,
  FormDateRow,
  FormSwitchRow,
} from "@/components/ui/form-primitives"

export default function ManageBorrowingModal() {
  const router = useRouter()
  const { activeSpaceId } = useSpace()
  const { id: editBorrowingId } = useLocalSearchParams<{ id?: string }>()
  const isEditMode = Boolean(editBorrowingId)
  const queryClient = useQueryClient()
  const toast = useToast()

  // Sheet references
  const currencySheetRef = useRef<BottomSheet>(null)
  const accountSheetRef = useRef<BottomSheet>(null)

  // 1. Settings & Base Currency
  const { data: settingsData } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = settingsData?.baseCurrency || "USD"

  // 2. Currencies, Accounts, Institutions
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

  // 3. Existing Borrowing Query
  const { data: existingBorrowing, isLoading: isExistingLoading } =
    useGetBorrowingQuery({ id: editBorrowingId || "" }, { enabled: isEditMode })

  const defaultFormValues: BorrowingFormValues = useMemo(() => {
    if (existingBorrowing) {
      const estDate = existingBorrowing.establishedAt
        ? new Date(existingBorrowing.establishedAt)
        : new Date()
      const dDate = existingBorrowing.dueAt
        ? new Date(existingBorrowing.dueAt)
        : undefined

      return {
        direction: (existingBorrowing.direction ||
          "LENT") as Borrowing_Direction,
        counterparty: existingBorrowing.counterparty || "",
        contactInfo: existingBorrowing.contactInfo || "",
        amount: formatCents(existingBorrowing.totalAmount).toString(),
        currency: existingBorrowing.currency || baseCurrency,
        establishedAt: !isNaN(estDate.getTime()) ? estDate : new Date(),
        hasDueDate: Boolean(existingBorrowing.dueAt),
        dueAt: dDate && !isNaN(dDate.getTime()) ? dDate : undefined,
        createAsTransaction: Boolean(existingBorrowing.accountId),
        accountId: existingBorrowing.accountId || "",
        notes: existingBorrowing.notes || "",
      }
    }
    return {
      direction: "LENT",
      counterparty: "",
      contactInfo: "",
      amount: "",
      currency: baseCurrency,
      establishedAt: new Date(),
      hasDueDate: false,
      dueAt: undefined,
      createAsTransaction: false,
      accountId: "",
      notes: "",
    }
  }, [existingBorrowing, baseCurrency])

  // RHF Form
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { isSubmitting },
  } = useForm<BorrowingFormValues>({
    resolver: zodResolver(BorrowingSchema),
    defaultValues: defaultFormValues,
    values: defaultFormValues,
    resetOptions: { keepDirtyValues: true },
  })

  // Watch only discrete selector fields
  const [
    direction = "LENT",
    currency = baseCurrency,
    hasDueDate = false,
    createAsTransaction = false,
    accountId = "",
    amount = "",
  ] = useWatch({
    control,
    name: [
      "direction",
      "currency",
      "hasDueDate",
      "createAsTransaction",
      "accountId",
      "amount",
    ] as const,
  })

  // Mutations
  const createMutation = useCreateBorrowingMutation()
  const updateMutation = useUpdateBorrowingMutation()
  const deleteMutation = useDeleteBorrowingMutation()

  const isSaving =
    createMutation.isPending || updateMutation.isPending || isSubmitting
  const isDeleting = deleteMutation.isPending

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  )

  const currentSymbol = getCurrencySymbol(currency)

  const onValid = async (values: BorrowingFormValues) => {
    haptics.light()

    const centsAmount = toCentsString(values.amount)

    try {
      const borrowingPayload = {
        direction: values.direction,
        counterparty: values.counterparty.trim(),
        contactInfo: values.contactInfo?.trim() || "",
        totalAmount: centsAmount,
        currency: values.currency,
        establishedAt: values.establishedAt.toISOString(),
        dueAt:
          values.hasDueDate && values.dueAt
            ? values.dueAt.toISOString()
            : undefined,
        createAsTransaction: !isEditMode && values.createAsTransaction,
        accountId:
          !isEditMode && values.createAsTransaction && values.accountId
            ? values.accountId
            : undefined,
        notes: values.notes?.trim() || "",
        status: existingBorrowing?.status || "ACTIVE",
      } as Borrowing

      if (isEditMode && editBorrowingId) {
        await updateMutation.mutateAsync({
          id: editBorrowingId,
          req: {
            id: editBorrowingId,
            borrowing: borrowingPayload,
          },
        })
        haptics.success()
        toast.show({
          title: "Agreement Updated",
          message: `Debt record with ${values.counterparty.trim()} was updated.`,
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          borrowing: borrowingPayload,
        })
        haptics.success()
        toast.show({
          title: "Agreement Recorded",
          message: `Debt record with ${values.counterparty.trim()} has been saved.`,
          type: "success",
        })
      }

      await invalidateFinanceQueries(queryClient)
      router.back()
    } catch (err: any) {
      haptics.error()
      toast.show({
        title: isEditMode ? "Update Failed" : "Create Failed",
        message: err?.message || "Could not save borrowing agreement.",
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!editBorrowingId) return
    const counterparty = getValues("counterparty")
    haptics.warning()

    Alert.alert(
      "Delete Debt Agreement",
      `Are you sure you want to delete this agreement with ${counterparty}? This will delete all logged repayments and associated ledger entries.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({
                id: editBorrowingId,
                req: {
                  id: editBorrowingId,
                },
              })
              haptics.success()
              toast.show({
                title: "Agreement Deleted",
                message: `Debt record with ${counterparty} was deleted.`,
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: "Delete Failed",
                message: err?.message || "Could not delete agreement.",
                type: "error",
              })
            }
          },
        },
      ]
    )
  }

  if (isEditMode && isExistingLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  const isLent = direction === "LENT"

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode ? "Edit Debt / Loan" : "Record Debt / Loan",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => router.back()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={theme.colors.textPrimary} />
            </TouchableOpacity>
          ),
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.textPrimary,
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
          {/* 1. Direction Switcher (Lent vs Borrowed) */}
          <View style={styles.directionToggleContainer}>
            <TouchableOpacity
              style={[
                styles.directionToggleBtn,
                isLent && styles.directionToggleBtnLentActive,
              ]}
              onPress={() => {
                haptics.selection()
                setValue("direction", "LENT", { shouldValidate: true })
              }}
              activeOpacity={0.7}
            >
              <TrendingUp
                size={16}
                color={isLent ? theme.colors.success : theme.colors.textMuted}
              />
              <Text
                style={[
                  styles.directionToggleText,
                  isLent && styles.directionToggleTextLentActive,
                ]}
              >
                Lent (Owed to Me)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.directionToggleBtn,
                !isLent && styles.directionToggleBtnBorrowedActive,
              ]}
              onPress={() => {
                haptics.selection()
                setValue("direction", "BORROWED", { shouldValidate: true })
              }}
              activeOpacity={0.7}
            >
              <TrendingDown
                size={16}
                color={
                  !isLent ? theme.colors.destructive : theme.colors.textMuted
                }
              />
              <Text
                style={[
                  styles.directionToggleText,
                  !isLent && styles.directionToggleTextBorrowedActive,
                ]}
              >
                Borrowed (I Owe)
              </Text>
            </TouchableOpacity>
          </View>

          {/* 2. Amount Card */}
          <HeroAmountInput
            control={control}
            name="amount"
            currency={currency}
            currencySymbol={currentSymbol}
            onPressCurrency={() => {
              Keyboard.dismiss()
              currencySheetRef.current?.expand()
            }}
            accentColor={
              isLent ? theme.colors.success : theme.colors.destructive
            }
            autoFocus
          />

          {/* 3. Agreement Details Card */}
          <Card style={formStyles.formGroupCard}>
            {/* Counterparty Name */}
            <FormRowInput
              control={control}
              name="counterparty"
              label={isLent ? "Borrower" : "Lender"}
              icon={<User size={16} color={theme.colors.textMuted} />}
              placeholder="Name of contact / institution"
              returnKeyType="next"
            />

            {/* Contact Info (Optional) */}
            <View style={formStyles.rowDivider} />
            <FormRowInput
              control={control}
              name="contactInfo"
              label="Contact"
              icon={<Phone size={16} color={theme.colors.textMuted} />}
              placeholder="Email, phone or handle (optional)"
              returnKeyType="next"
            />

            {/* Date Established */}
            <View style={formStyles.rowDivider} />
            <FormDateRow
              control={control}
              name="establishedAt"
              label="Established Date"
              icon={<Calendar size={16} color={theme.colors.textMuted} />}
              title="Select Established Date"
            />

            {/* Has Due Date Toggle */}
            <View style={formStyles.rowDivider} />
            <FormSwitchRow
              control={control}
              name="hasDueDate"
              label="Set Due Date"
              icon={<CalendarClock size={16} color={theme.colors.textMuted} />}
            />

            {/* Due Date Picker (if enabled) */}
            {hasDueDate && (
              <>
                <View style={formStyles.rowDivider} />
                <FormDateRow
                  control={control}
                  name="dueAt"
                  label="Target Due Date"
                  icon={
                    <CalendarClock
                      size={16}
                      color={
                        isLent ? theme.colors.success : theme.colors.destructive
                      }
                    />
                  }
                  title="Select Target Due Date"
                />
              </>
            )}
          </Card>

          {/* 4. Ledger Integration (Initial transaction movement, new records only) */}
          {!isEditMode && (
            <Card style={[formStyles.formGroupCard, { marginTop: 12 }]}>
              <FormSwitchRow
                control={control}
                name="createAsTransaction"
                label="Post to Account"
                subtitle={
                  isLent
                    ? "Record disbursement from bank balance"
                    : "Record loan receipt to bank balance"
                }
                icon={<Landmark size={16} color={theme.colors.textMuted} />}
                onValueChange={(val) => {
                  if (val && !accountId && accounts.length > 0) {
                    setValue("accountId", accounts[0].id || "", {
                      shouldValidate: true,
                    })
                  }
                }}
              />

              {createAsTransaction && (
                <>
                  <View style={formStyles.rowDivider} />
                  <AccountRow
                    label="Account"
                    account={selectedAccount}
                    placeholder="Select payment account"
                    onPress={() => {
                      Keyboard.dismiss()
                      accountSheetRef.current?.expand()
                    }}
                  />
                </>
              )}
            </Card>
          )}

          {/* 5. Notes Card */}
          <Card style={[formStyles.formGroupCard, { marginTop: 12 }]}>
            <FormRowInput
              control={control}
              name="notes"
              label="Notes"
              icon={<FileText size={16} color={theme.colors.textMuted} />}
              placeholder="Collateral, payment schedule, terms..."
              multiline
              numberOfLines={3}
              style={styles.notesInput}
            />
          </Card>

          {/* Delete Action (Edit Mode only) */}
          {isEditMode ? (
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
                    Delete Debt Agreement
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        {/* Docked Save Button */}
        <View style={[styles.bottomDock, { paddingBottom: Math.max(16, 24) }]}>
          <Button
            size="lg"
            variant="primary"
            loading={isSaving}
            onPress={handleSubmit(onValid)}
            style={[
              styles.submitBtn,
              isLent ? styles.submitBtnLent : styles.submitBtnBorrowed,
            ]}
          >
            {isEditMode
              ? "Save Changes"
              : isLent
                ? `Record Loan • ${currentSymbol}${amount || "0.00"}`
                : `Record Borrowing • ${currentSymbol}${amount || "0.00"}`}
          </Button>
        </View>
      </KeyboardAvoidingView>

      {/* Sheets outside ScrollView */}
      <CurrencyPickerSheet
        ref={currencySheetRef}
        currencies={currencies}
        selectedCurrency={currency}
        onSelect={(code) =>
          setValue("currency", code, { shouldValidate: true })
        }
      />

      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        institutions={institutions}
        selectedAccountId={accountId}
        onSelect={(id) => {
          setValue("accountId", id, { shouldValidate: true })
          accountSheetRef.current?.close()
        }}
        allowNoAccount={false}
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
    paddingBottom: 40,
  },
  directionToggleContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  directionToggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  directionToggleBtnLentActive: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.successSubtle,
  },
  directionToggleBtnBorrowedActive: {
    borderColor: theme.colors.destructive,
    backgroundColor: theme.colors.destructiveSubtle,
  },
  directionToggleText: {
    fontSize: 13,
    fontWeight: "600",
    color: theme.colors.textMuted,
  },
  directionToggleTextLentActive: {
    color: theme.colors.success,
    fontWeight: "700",
  },
  directionToggleTextBorrowedActive: {
    color: theme.colors.destructive,
    fontWeight: "700",
  },
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
  subtext: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  notesInput: {
    textAlign: "left",
    minHeight: 48,
    paddingTop: 8,
  },
  errorText: {
    fontSize: 12,
    color: theme.colors.destructive,
    fontWeight: "500",
    marginTop: 6,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: "rgba(244, 63, 94, 0.3)",
    backgroundColor: theme.colors.destructiveSubtle,
  },
  deleteBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.destructive,
  },
  bottomDock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  submitBtn: {
    width: "100%",
  },
  submitBtnLent: {
    backgroundColor: theme.colors.success,
  },
  submitBtnBorrowed: {
    backgroundColor: "#d97706",
  },
})
