import React, { useState, useEffect, useRef, useMemo } from "react"
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
  TextInput,
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
  ChevronDown,
  User,
  Phone,
  FileText,
  HandCoins,
  TrendingUp,
  TrendingDown,
  Landmark,
} from "lucide-react-native"
import { borrowingSchema } from "@saturn/schemas"
import {
  useCreateBorrowingMutation,
  useUpdateBorrowingMutation,
  useDeleteBorrowingMutation,
  useGetBorrowingQuery,
  useListCurrenciesQuery,
  useListAccountsQuery,
  useListInstitutionsQuery,
  useGetFinanceSettingsQuery,
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
  DatePickerSheet,
  formatDisplayDate,
} from "@/components/ui/date-picker-sheet"
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
  const dateSheetRef = useRef<BottomSheet>(null)

  // 1. Settings & Base Currency
  const { data: settingsData } = useGetFinanceSettingsQuery(
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
  const accounts: Account[] = accountsData?.accounts || []

  const { data: instData } = useListInstitutionsQuery(
    { pageSize: 100, pageToken: "" },
    { enabled: !!activeSpaceId }
  )
  const institutions: Account_InstitutionInfo[] = instData?.institutions || []

  // 3. Existing Borrowing Query
  const { data: existingBorrowing, isLoading: isExistingLoading } =
    useGetBorrowingQuery({ id: editBorrowingId || "" }, { enabled: isEditMode })

  // Form State
  const [direction, setDirection] = useState<Borrowing_Direction>("LENT")
  const [counterparty, setCounterparty] = useState("")
  const [contactInfo, setContactInfo] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState(baseCurrency)
  const [establishedAt, setEstablishedAt] = useState<Date>(new Date())
  const [hasDueDate, setHasDueDate] = useState(false)
  const [dueAt, setDueAt] = useState<Date>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  )
  const [createAsTransaction, setCreateAsTransaction] = useState(false)
  const [accountId, setAccountId] = useState("")
  const [notes, setNotes] = useState("")
  const [activeDatePickerTarget, setActiveDatePickerTarget] = useState<
    "established" | "due"
  >("established")
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Initialize values when existing borrowing loads
  useEffect(() => {
    if (existingBorrowing) {
      setDirection(existingBorrowing.direction || "LENT")
      setCounterparty(existingBorrowing.counterparty || "")
      setContactInfo(existingBorrowing.contactInfo || "")
      setAmount(formatCents(existingBorrowing.totalAmount).toString())
      setCurrency(existingBorrowing.currency || baseCurrency)

      if (existingBorrowing.establishedAt) {
        const estDate = new Date(existingBorrowing.establishedAt)
        if (!isNaN(estDate.getTime())) setEstablishedAt(estDate)
      }

      if (existingBorrowing.dueAt) {
        const dDate = new Date(existingBorrowing.dueAt)
        if (!isNaN(dDate.getTime())) {
          setHasDueDate(true)
          setDueAt(dDate)
        }
      } else {
        setHasDueDate(false)
      }

      setCreateAsTransaction(Boolean(existingBorrowing.accountId))
      setAccountId(existingBorrowing.accountId || "")
      setNotes(existingBorrowing.notes || "")
    } else if (!isEditMode) {
      setCurrency(baseCurrency)
    }
  }, [existingBorrowing, baseCurrency, isEditMode])

  // Mutations
  const createMutation = useCreateBorrowingMutation()
  const updateMutation = useUpdateBorrowingMutation()
  const deleteMutation = useDeleteBorrowingMutation()

  const isSaving = createMutation.isPending || updateMutation.isPending
  const isDeleting = deleteMutation.isPending

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  )

  const currentSymbol = getCurrencySymbol(currency)

  // Amount input handler
  const handleAmountChange = (text: string) => {
    let cleaned = text.replace(/[^0-9.]/g, "")
    const parts = cleaned.split(".")
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts.slice(1).join("")
    }
    if (parts[1] && parts[1].length > 2) {
      cleaned = parts[0] + "." + parts[1].slice(0, 2)
    }
    setAmount(cleaned)
    if (errors.amount) {
      setErrors((prev) => ({ ...prev, amount: "" }))
    }
  }

  const handleSave = async () => {
    haptics.light()
    setErrors({})

    const validation = borrowingSchema.safeParse({
      direction,
      counterparty: counterparty.trim(),
      contactInfo: contactInfo.trim() || undefined,
      amount: amount.trim(),
      currency,
      establishedAt,
      hasDueDate,
      dueAt: hasDueDate ? dueAt : undefined,
      createAsTransaction: !isEditMode && createAsTransaction,
      notes: notes.trim() || undefined,
    })

    if (!validation.success) {
      haptics.warning()
      const newErrors: Record<string, string> = {}
      validation.error.issues.forEach((issue) => {
        const fieldName = issue.path[0]?.toString() || "form"
        newErrors[fieldName] = issue.message
      })
      setErrors(newErrors)
      return
    }

    const centsAmount = toCentsString(amount)

    try {
      const borrowingPayload = {
        direction,
        counterparty: counterparty.trim(),
        contactInfo: contactInfo.trim(),
        totalAmount: centsAmount,
        currency,
        establishedAt: establishedAt.toISOString(),
        dueAt: hasDueDate && dueAt ? dueAt.toISOString() : undefined,
        createAsTransaction: !isEditMode && createAsTransaction,
        accountId:
          !isEditMode && createAsTransaction && accountId
            ? accountId
            : undefined,
        notes: notes.trim(),
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
          message: `Debt record with ${counterparty.trim()} was updated.`,
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          borrowing: borrowingPayload,
        })
        haptics.success()
        toast.show({
          title: "Agreement Recorded",
          message: `Debt record with ${counterparty.trim()} has been saved.`,
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
                setDirection("LENT")
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
                setDirection("BORROWED")
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
          <Card style={styles.amountCard}>
            <Text style={styles.fieldSectionLabel}>PRINCIPAL AMOUNT</Text>
            <View style={styles.amountInputRow}>
              <Text
                style={[
                  styles.amountCurrencyPrefix,
                  {
                    color: isLent
                      ? theme.colors.success
                      : theme.colors.destructive,
                  },
                ]}
              >
                {currentSymbol}
              </Text>
              <TextInput
                style={[
                  styles.amountInput,
                  {
                    color: isLent
                      ? theme.colors.success
                      : theme.colors.destructive,
                  },
                ]}
                placeholder="0.00"
                placeholderTextColor={theme.colors.textMuted}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={handleAmountChange}
                selectionColor={
                  isLent ? theme.colors.success : theme.colors.destructive
                }
              />
              <TouchableOpacity
                onPress={() => {
                  haptics.light()
                  Keyboard.dismiss()
                  currencySheetRef.current?.expand()
                }}
                style={styles.currencySelectButton}
              >
                <Text style={styles.currencySelectCode} numberOfLines={1}>
                  {currency}
                </Text>
                <ChevronDown size={14} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            {errors.amount ? (
              <Text style={styles.errorText}>{errors.amount}</Text>
            ) : null}
          </Card>

          {/* 3. Agreement Details Card */}
          <Card style={formStyles.formGroupCard}>
            {/* Counterparty Name */}
            <View style={formStyles.formRow}>
              <View style={formStyles.formRowLabelGroup}>
                <User size={16} color={theme.colors.textMuted} />
                <Text style={formStyles.formRowLabel}>
                  {isLent ? "Borrower" : "Lender"}
                </Text>
              </View>
              <TextInput
                style={formStyles.formRowInput}
                placeholder="Name of contact / institution"
                placeholderTextColor={theme.colors.textMuted}
                value={counterparty}
                onChangeText={(val) => {
                  setCounterparty(val)
                  if (errors.counterparty) {
                    setErrors((prev) => ({ ...prev, counterparty: "" }))
                  }
                }}
                returnKeyType="next"
              />
            </View>
            {errors.counterparty ? (
              <Text style={[styles.errorText, { paddingHorizontal: 16 }]}>
                {errors.counterparty}
              </Text>
            ) : null}

            {/* Contact Info (Optional) */}
            <View style={formStyles.rowDivider} />
            <View style={formStyles.formRow}>
              <View style={formStyles.formRowLabelGroup}>
                <Phone size={16} color={theme.colors.textMuted} />
                <Text style={formStyles.formRowLabel}>Contact</Text>
              </View>
              <TextInput
                style={formStyles.formRowInput}
                placeholder="Email, phone or handle (optional)"
                placeholderTextColor={theme.colors.textMuted}
                value={contactInfo}
                onChangeText={setContactInfo}
                returnKeyType="next"
              />
            </View>

            {/* Date Established */}
            <View style={formStyles.rowDivider} />
            <TouchableOpacity
              style={formStyles.formRow}
              activeOpacity={0.7}
              onPress={() => {
                Keyboard.dismiss()
                setActiveDatePickerTarget("established")
                dateSheetRef.current?.expand()
              }}
            >
              <View style={formStyles.formRowLabelGroup}>
                <Calendar size={16} color={theme.colors.textMuted} />
                <Text style={formStyles.formRowLabel}>Established Date</Text>
              </View>
              <View style={formStyles.formRowValueGroup}>
                <Text style={formStyles.formRowValueText}>
                  {formatDisplayDate(establishedAt)}
                </Text>
              </View>
            </TouchableOpacity>

            {/* Has Due Date Toggle */}
            <View style={formStyles.rowDivider} />
            <View style={formStyles.formRow}>
              <View style={formStyles.formRowLabelGroup}>
                <CalendarClock size={16} color={theme.colors.textMuted} />
                <Text style={formStyles.formRowLabel}>Set Due Date</Text>
              </View>
              <Switch
                value={hasDueDate}
                onValueChange={(val) => {
                  haptics.selection()
                  setHasDueDate(val)
                }}
                trackColor={{
                  false: theme.colors.surfaceElevated,
                  true: theme.colors.primary,
                }}
                thumbColor="#ffffff"
              />
            </View>

            {/* Due Date Picker (if enabled) */}
            {hasDueDate && (
              <>
                <View style={formStyles.rowDivider} />
                <TouchableOpacity
                  style={formStyles.formRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    Keyboard.dismiss()
                    setActiveDatePickerTarget("due")
                    dateSheetRef.current?.expand()
                  }}
                >
                  <View style={formStyles.formRowLabelGroup}>
                    <CalendarClock
                      size={16}
                      color={
                        isLent ? theme.colors.success : theme.colors.destructive
                      }
                    />
                    <Text style={formStyles.formRowLabel}>Target Due Date</Text>
                  </View>
                  <View style={formStyles.formRowValueGroup}>
                    <Text
                      style={[
                        formStyles.formRowValueText,
                        {
                          color: isLent
                            ? theme.colors.success
                            : theme.colors.destructive,
                        },
                      ]}
                    >
                      {formatDisplayDate(dueAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            )}
          </Card>

          {/* 4. Ledger Integration (Initial transaction movement, new records only) */}
          {!isEditMode && (
            <Card style={[formStyles.formGroupCard, { marginTop: 12 }]}>
              <View style={formStyles.formRow}>
                <View style={[formStyles.formRowLabelGroup, { flex: 1 }]}>
                  <Landmark size={16} color={theme.colors.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={formStyles.formRowLabel}>Post to Account</Text>
                    <Text style={styles.subtext}>
                      {isLent
                        ? "Record disbursement from bank balance"
                        : "Record loan receipt to bank balance"}
                    </Text>
                  </View>
                </View>
                <Switch
                  value={createAsTransaction}
                  onValueChange={(val) => {
                    haptics.selection()
                    setCreateAsTransaction(val)
                    if (val && !accountId && accounts.length > 0) {
                      setAccountId(accounts[0].id || "")
                    }
                  }}
                  trackColor={{
                    false: theme.colors.surfaceElevated,
                    true: theme.colors.primary,
                  }}
                  thumbColor="#ffffff"
                />
              </View>

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
            <View style={formStyles.formRow}>
              <View style={formStyles.formRowLabelGroup}>
                <FileText size={16} color={theme.colors.textMuted} />
                <Text style={formStyles.formRowLabel}>Notes</Text>
              </View>
              <TextInput
                style={[formStyles.formRowInput, styles.notesInput]}
                placeholder="Collateral, payment schedule, terms..."
                placeholderTextColor={theme.colors.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
              />
            </View>
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
            onPress={handleSave}
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
        onSelect={(code) => setCurrency(code)}
      />

      <AccountPickerSheet
        ref={accountSheetRef}
        accounts={accounts}
        institutions={institutions}
        selectedAccountId={accountId}
        onSelect={(id) => {
          setAccountId(id)
          accountSheetRef.current?.close()
        }}
        allowNoAccount={false}
      />

      <DatePickerSheet
        ref={dateSheetRef}
        title={
          activeDatePickerTarget === "due"
            ? "Select Target Due Date"
            : "Select Established Date"
        }
        value={activeDatePickerTarget === "due" ? dueAt : establishedAt}
        onChange={(d) => {
          if (activeDatePickerTarget === "due") {
            setDueAt(d)
          } else {
            setEstablishedAt(d)
          }
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
