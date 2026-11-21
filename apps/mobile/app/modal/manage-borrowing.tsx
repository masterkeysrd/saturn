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
import { formatCents, getCurrencySymbol, toCentsString } from "@saturn/core"
import { invalidateFinanceQueries, useI18n } from "@saturn/hooks"
import { useSpace } from "@/lib/space-context"
import { useTheme, useThemedStyles, type SaturnMobileTheme } from "@/lib/theme"
import { haptics } from "@/lib/haptics"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import {
  CurrencyPickerSheet,
  AccountPickerSheet,
} from "@/components/finance/sheets"
import { AccountRow } from "@/components/finance/account-select"
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
  const { t } = useI18n()
  const { colors } = useTheme()
  const styles = useThemedStyles(createStyles)

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
          title: t("finance.borrowing.mobile.toastUpdatedTitle"),
          message: t("finance.borrowing.mobile.toastUpdatedDesc", {
            name: values.counterparty.trim(),
          }),
          type: "success",
        })
      } else {
        await createMutation.mutateAsync({
          borrowing: borrowingPayload,
        })
        haptics.success()
        toast.show({
          title: t("finance.borrowing.mobile.toastRecordedTitle"),
          message: t("finance.borrowing.mobile.toastRecordedDesc", {
            name: values.counterparty.trim(),
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
          ? t("finance.borrowing.mobile.toastUpdateFailed")
          : t("finance.borrowing.mobile.toastCreateFailed"),
        message: err?.message || t("finance.borrowing.mobile.toastSaveFailed"),
        type: "error",
      })
    }
  }

  const handleDelete = () => {
    if (!editBorrowingId) return
    const counterparty = getValues("counterparty")
    haptics.warning()

    Alert.alert(
      t("finance.borrowing.delete.title"),
      t("finance.borrowing.delete.description", { name: counterparty }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
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
                title: t("finance.borrowing.delete.deletedTitle"),
                message: t("finance.borrowing.delete.deletedDescription", {
                  name: counterparty,
                }),
                type: "info",
              })
              await invalidateFinanceQueries(queryClient)
              router.back()
            } catch (err: any) {
              haptics.error()
              toast.show({
                title: t("finance.borrowing.delete.failedTitle"),
                message:
                  err?.message ||
                  t("finance.borrowing.delete.failedDescription"),
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
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const isLent = direction === "LENT"

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: isEditMode
            ? t("finance.borrowing.mobile.headerTitleEdit")
            : t("finance.borrowing.mobile.headerTitleCreate"),
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
              }
            : {
                headerLeft: () => (
                  <TouchableOpacity
                    onPress={() => router.back()}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <X size={20} color={colors.textPrimary} />
                  </TouchableOpacity>
                ),
              }),
          ...(Platform.OS !== "ios" && {
            headerStyle: {
              backgroundColor: colors.background,
            },
          }),
          headerTintColor: colors.textPrimary,
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
                color={isLent ? colors.success : colors.textMuted}
              />
              <Text
                style={[
                  styles.directionToggleText,
                  isLent && styles.directionToggleTextLentActive,
                ]}
              >
                {t("finance.borrowing.sheet.directionLent")}
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
                color={!isLent ? colors.destructive : colors.textMuted}
              />
              <Text
                style={[
                  styles.directionToggleText,
                  !isLent && styles.directionToggleTextBorrowedActive,
                ]}
              >
                {t("finance.borrowing.sheet.directionBorrowed")}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 2. Amount Card */}
          <HeroAmountInput
            control={control}
            name="amount"
            currency={currency}
            currencySymbol={currentSymbol}
            label={t("finance.borrowing.sheet.amountLabel").toUpperCase()}
            onPressCurrency={() => {
              Keyboard.dismiss()
              currencySheetRef.current?.expand()
            }}
            accentColor={isLent ? colors.success : colors.destructive}
            autoFocus
          />

          {/* 3. Agreement Details Card */}
          <Card style={styles.formGroupCard}>
            {/* Counterparty Name */}
            <FormRowInput
              control={control}
              name="counterparty"
              label={
                isLent
                  ? t("finance.borrowing.mobile.borrowerLabel")
                  : t("finance.borrowing.mobile.lenderLabel")
              }
              icon={<User size={16} color={colors.textMuted} />}
              placeholder={t("finance.borrowing.sheet.namePlaceholder")}
              returnKeyType="next"
            />

            {/* Contact Info (Optional) */}
            <View style={styles.rowDivider} />
            <FormRowInput
              control={control}
              name="contactInfo"
              label={t("finance.borrowing.mobile.contactShort")}
              icon={<Phone size={16} color={colors.textMuted} />}
              placeholder={t("finance.borrowing.sheet.contactPlaceholder")}
              returnKeyType="next"
            />

            {/* Date Established */}
            <View style={styles.rowDivider} />
            <FormDateRow
              control={control}
              name="establishedAt"
              label={t("finance.borrowing.sheet.establishedLabel")}
              icon={<Calendar size={16} color={colors.textMuted} />}
              title={t("finance.borrowing.mobile.selectEstablishedDate")}
            />

            {/* Has Due Date Toggle */}
            <View style={styles.rowDivider} />
            <FormSwitchRow
              control={control}
              name="hasDueDate"
              label={t("finance.borrowing.mobile.setDueDateToggle")}
              icon={<CalendarClock size={16} color={colors.textMuted} />}
            />

            {/* Due Date Picker (if enabled) */}
            {hasDueDate && (
              <>
                <View style={styles.rowDivider} />
                <FormDateRow
                  control={control}
                  name="dueAt"
                  label={t("finance.borrowing.mobile.targetDueDate")}
                  icon={
                    <CalendarClock
                      size={16}
                      color={isLent ? colors.success : colors.destructive}
                    />
                  }
                  title={t("finance.borrowing.mobile.selectTargetDueDate")}
                />
              </>
            )}
          </Card>

          {/* 4. Ledger Integration (Initial transaction movement, new records only) */}
          {!isEditMode && (
            <Card style={[styles.formGroupCard, { marginTop: 12 }]}>
              <FormSwitchRow
                control={control}
                name="createAsTransaction"
                label={t("finance.borrowing.mobile.postToAccount")}
                subtitle={
                  isLent
                    ? t("finance.borrowing.mobile.postToAccountLent")
                    : t("finance.borrowing.mobile.postToAccountBorrowed")
                }
                icon={<Landmark size={16} color={colors.textMuted} />}
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
                  <View style={styles.rowDivider} />
                  <AccountRow
                    label={t("finance.borrowing.mobile.accountShort")}
                    account={selectedAccount}
                    placeholder={t(
                      "finance.borrowing.mobile.selectPaymentAccount"
                    )}
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
          <Card style={[styles.formGroupCard, { marginTop: 12 }]}>
            <FormRowInput
              control={control}
              name="notes"
              label={t("finance.borrowing.sheet.notesLabel")}
              icon={<FileText size={16} color={colors.textMuted} />}
              placeholder={t("finance.borrowing.mobile.notesTermsPlaceholder")}
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
                <ActivityIndicator size="small" color={colors.destructive} />
              ) : (
                <>
                  <Trash2 size={16} color={colors.destructive} />
                  <Text style={styles.deleteBtnText}>
                    {t("finance.borrowing.delete.title")}
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
              ? t("finance.borrowing.sheet.saveSubmit")
              : isLent
                ? t("finance.borrowing.mobile.recordLoanWith", {
                    amount: `${currentSymbol}${amount || "0.00"}`,
                  })
                : t("finance.borrowing.mobile.recordBorrowingWith", {
                    amount: `${currentSymbol}${amount || "0.00"}`,
                  })}
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
    paddingBottom: 40,
  },
  formGroupCard: {
    padding: 0,
    overflow: "hidden" as const,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: t.colors.border,
  },
  directionToggleContainer: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 12,
  },
  directionToggleBtn: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    paddingVertical: 12,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: t.colors.border,
  },
  directionToggleBtnLentActive: {
    borderColor: t.colors.success,
    backgroundColor: t.colors.successSubtle,
  },
  directionToggleBtnBorrowedActive: {
    borderColor: t.colors.destructive,
    backgroundColor: t.colors.destructiveSubtle,
  },
  directionToggleText: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  directionToggleTextLentActive: {
    color: t.colors.success,
    fontWeight: "700" as const,
  },
  directionToggleTextBorrowedActive: {
    color: t.colors.destructive,
    fontWeight: "700" as const,
  },
  amountCard: {
    backgroundColor: t.colors.surfaceElevated,
    borderRadius: t.radius.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: t.colors.border,
    marginBottom: 12,
  },
  fieldSectionLabel: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  amountInputRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  amountCurrencyPrefix: {
    fontSize: 34,
    fontWeight: "800" as const,
    marginRight: 4,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    flexShrink: 0,
  },
  amountInput: {
    flex: 1,
    fontSize: 34,
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
    backgroundColor: t.colors.background,
    borderWidth: 1,
    borderColor: t.colors.border,
    minWidth: 68,
  },
  currencySelectCode: {
    fontSize: 13,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
    letterSpacing: 0.5,
    flexShrink: 0,
  },
  subtext: {
    fontSize: 11,
    color: t.colors.textMuted,
    marginTop: 2,
  },
  notesInput: {
    textAlign: "left" as const,
    minHeight: 48,
    paddingTop: 8,
  },
  errorText: {
    fontSize: 12,
    color: t.colors.destructive,
    fontWeight: "500" as const,
    marginTop: 6,
  },
  deleteBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    marginTop: 16,
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
  bottomDock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: t.colors.background,
    borderTopWidth: 1,
    borderTopColor: t.colors.border,
  },
  submitBtn: {
    width: "100%" as const,
  },
  submitBtnLent: {
    backgroundColor: t.colors.success,
  },
  submitBtnBorrowed: {
    backgroundColor: t.colors.warning,
  },
})
