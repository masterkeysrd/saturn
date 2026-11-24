import { useState } from "react"
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
  FlatList,
  Platform,
} from "react-native"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useQueryClient } from "@tanstack/react-query"
import AsyncStorage from "@react-native-async-storage/async-storage"
import Constants from "expo-constants"
import {
  ShieldCheck,
  Layers,
  Users,
  Bell,
  LogOut,
  ChevronRight,
  Sparkles,
  Fingerprint,
  HardDrive,
  Coins,
  Info,
  CheckCircle2,
  Globe,
  Calendar,
  Check,
  X,
  Link2,
  KeyRound,
  Workflow,
  Sun,
  Moon,
  Smartphone,
  Mail,
} from "lucide-react-native"
import {
  useListActiveSessionsQuery,
  useListMFAFactorsQuery,
} from "@saturn/api/saturn/identity/v1/identity"
import {
  useGetSettingsQuery,
  useUpdateSettingsMutation as useUpdateFinanceSettingsMutation,
} from "@saturn/api/saturn/finance/v1/finance"
import { FISCAL_YEAR_MONTHS } from "@saturn/core"
import { SUPPORTED_UI_LOCALES } from "@saturn/i18n"
import type { TranslationKey } from "@saturn/i18n"
import { useI18n } from "@saturn/hooks"
import { useAuth } from "@/lib/auth-context"
import { useSpace } from "@/lib/space-context"
import {
  useTheme,
  useThemedStyles,
  type SaturnMobileTheme,
  type ThemeMode,
} from "@/lib/theme"
import { Avatar } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { MfaStepUpModal } from "@/components/ui/mfa-stepup-modal"
import { useToast } from "@/components/ui/toast"
import { haptics } from "@/lib/haptics"

const APPEARANCE_OPTIONS: readonly {
  value: ThemeMode
  labelKey: TranslationKey
  Icon: typeof Sun
}[] = [
  { value: "light", labelKey: "menu.light", Icon: Sun },
  { value: "dark", labelKey: "menu.dark", Icon: Moon },
  { value: "system", labelKey: "menu.system", Icon: Smartphone },
]

const FISCAL_MONTH_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  "Calendar Year (Default)": "settings.finance.monthDescCalendar",
  "Retail 4-5-4 Calendar": "settings.finance.monthDescRetail",
  "Custom Fiscal Cycle": "settings.finance.monthDescCustom",
  "United Kingdom, India, Japan, Canada":
    "settings.finance.monthDescCommonwealth",
  "Australia, New Zealand, Academic": "settings.finance.monthDescOceania",
  "United States Federal": "settings.finance.monthDescUsFederal",
}

function formatMonthName(month: number, language: string): string {
  const date = new Date(2000, month - 1, 1)
  const name = new Intl.DateTimeFormat(language, { month: "long" }).format(date)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

export default function SettingsScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { mode, setMode, colors } = useTheme()
  const styles = useThemedStyles(createStyles)
  const {
    user,
    logout,
    isBiometricSupported,
    isBiometricActive,
    isDeviceEnrolled,
    toggleBiometrics,
    serverUrl,
  } = useAuth()
  const {
    activeSpace,
    activeSpaceRole,
    activeSpaceId,
    locale,
    hourCycle,
    weekStartsOn,
    mailAutoLoadRemoteContent,
    updateRegionalPreferences,
    updateMailPreferences,
  } = useSpace()
  const { t, language, supportedLocales } = useI18n()

  // 1. Query active sessions for device count indicator
  const { data: sessionsData } = useListActiveSessionsQuery({})
  const sessionCount = sessionsData?.sessions?.length ?? 1

  // 2. Query MFA factors to know if biometrics enrollment requires OTP upfront
  const { data: mfaData, refetch: refetchMfa } = useListMFAFactorsQuery({})
  const hasActiveMfa = Boolean(mfaData?.factors && mfaData.factors.length > 0)

  // 3. Query workspace finance settings for base currency
  const { data: financeSettings } = useGetSettingsQuery(
    {},
    { enabled: !!activeSpaceId }
  )
  const baseCurrency = financeSettings?.baseCurrency || "USD"
  const updateFinanceSettingsMutation = useUpdateFinanceSettingsMutation()
  const currentFiscalMonth = financeSettings?.fiscalYearStartMonth || 1

  const [signOutModalVisible, setSignOutModalVisible] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const [mfaModalVisible, setMfaModalVisible] = useState(false)
  const [enrollingWithMfa, setEnrollingWithMfa] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)
  const [fiscalYearModalVisible, setFiscalYearModalVisible] = useState(false)
  const [languageModalVisible, setLanguageModalVisible] = useState(false)

  const activeLocaleOption =
    supportedLocales.find((opt) => opt.value === locale) ??
    SUPPORTED_UI_LOCALES[0]

  const handleUpdateRegional = async (
    patch: Partial<{
      locale: string
      hourCycle: "h12" | "h23"
      weekStartsOn: 0 | 1
    }>
  ) => {
    try {
      haptics.selection()
      await updateRegionalPreferences(patch)
      toast.show({
        type: "success",
        title: t("settings.regional.saved"),
      })
    } catch (err: unknown) {
      haptics.error()
      toast.show({
        type: "error",
        title: t("menu.updateFailed"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.hub.mobile.updateFailedDefaultRegional"),
      })
    }
  }

  const handleToggleMailAutoLoad = async (next: boolean) => {
    try {
      haptics.selection()
      await updateMailPreferences({ autoLoadRemoteContent: next })
      toast.show({
        type: "success",
        title: next
          ? t("mail.autoLoadEnabledToast")
          : t("mail.autoLoadDisabledToast"),
      })
    } catch (err: unknown) {
      haptics.error()
      toast.show({
        type: "error",
        title: t("menu.updateFailed"),
        message:
          err instanceof Error ? err.message : t("mail.autoLoadUpdateFailed"),
      })
    }
  }

  const handleSelectFiscalYear = async (month: number) => {
    if (month === currentFiscalMonth) {
      setFiscalYearModalVisible(false)
      return
    }
    try {
      haptics.selection()
      await updateFinanceSettingsMutation.mutateAsync({
        settings: {
          ...financeSettings,
          spaceId: activeSpaceId || "",
          baseCurrency: baseCurrency,
          fiscalYearStartMonth: month,
        },
        updateMask: {
          paths: ["fiscal_year_start_month"],
        },
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/finance/settings"],
      })
      setFiscalYearModalVisible(false)
      toast.show({
        type: "success",
        title: t("settings.hub.mobile.fiscalUpdatedToast"),
        message: t("settings.finance.saveOkDesc", {
          month: formatMonthName(month, language),
        }),
      })
    } catch (err: unknown) {
      toast.show({
        type: "error",
        title: t("menu.updateFailed"),
        message:
          err instanceof Error
            ? err.message
            : t("settings.hub.mobile.updateFailedDefaultFiscal"),
      })
    }
  }

  const handleConfirmSignOut = async () => {
    setSigningOut(true)
    try {
      await logout()
      toast.show({
        type: "info",
        title: t("settings.hub.mobile.signedOutToast"),
        message: t("settings.hub.mobile.signedOutToastDesc"),
      })
      router.replace("/(auth)/login")
    } catch {
      setSigningOut(false)
      setSignOutModalVisible(false)
    }
  }

  const handleToggleBiometrics = async (val: boolean) => {
    if (!val) {
      try {
        await toggleBiometrics(false)
        haptics.light()
        toast.show({
          type: "info",
          title: t("settings.hub.mobile.biometricsDisabledToast"),
          message: t("settings.hub.mobile.biometricsDisabledToastDesc"),
        })
      } catch (err: any) {
        toast.show({
          type: "error",
          title: t("menu.updateFailed"),
          message:
            err?.message ||
            t("settings.hub.mobile.biometricDisableFailedDefault"),
        })
      }
      return
    }

    // Enabling:
    // If device is already enrolled, re-enabling requires no biometric prompts
    if (isDeviceEnrolled) {
      try {
        await toggleBiometrics(true)
        haptics.success()
        toast.show({
          type: "success",
          title: t("settings.hub.mobile.biometricsEnabledToast"),
          message: t("settings.hub.mobile.biometricsEnabledToastDesc"),
        })
      } catch (err: any) {
        toast.show({
          type: "error",
          title: t("settings.hub.mobile.biometricsFailedToast"),
          message:
            err?.message ||
            t("settings.hub.mobile.biometricEnableFailedDefault"),
        })
      }
      return
    }

    // If device is NOT enrolled and user has MFA active:
    // Prompt for OTP BEFORE triggering native biometric sensor
    if (hasActiveMfa) {
      setMfaError(null)
      setMfaModalVisible(true)
      return
    }

    // User has no MFA: enroll directly (prompts biometrics once)
    try {
      const success = await toggleBiometrics(true)
      if (success) {
        haptics.success()
        toast.show({
          type: "success",
          title: t("settings.hub.mobile.biometricsEnabledToast"),
          message: t("settings.hub.mobile.biometricsEnabledToastDesc"),
        })
        await refetchMfa()
      }
    } catch (err: any) {
      const msg = err?.message || ""
      if (
        msg.toLowerCase().includes("mfa") ||
        msg.toLowerCase().includes("totp") ||
        msg.toLowerCase().includes("verification")
      ) {
        setMfaError(null)
        setMfaModalVisible(true)
      } else {
        haptics.error()
        toast.show({
          type: "error",
          title: t("settings.hub.mobile.biometricsFailedToast"),
          message: msg || t("settings.hub.mobile.biometricToggleFailedDefault"),
        })
      }
    }
  }

  const handleMfaEnroll = async (code: string) => {
    setEnrollingWithMfa(true)
    setMfaError(null)
    try {
      const success = await toggleBiometrics(true, code)
      if (success) {
        haptics.success()
        setMfaModalVisible(false)
        toast.show({
          type: "success",
          title: t("settings.hub.mobile.biometricsEnabledToast"),
          message: t("settings.hub.mobile.biometricsEnabledToastDesc"),
        })
        await refetchMfa()
      }
    } catch (err: any) {
      const msg = err?.message || ""
      if (
        msg.toLowerCase().includes("mfa") ||
        msg.toLowerCase().includes("totp") ||
        msg.toLowerCase().includes("verification")
      ) {
        setMfaError(t("settings.devices.mobile.invalidCode"))
      } else {
        haptics.error()
        toast.show({
          type: "error",
          title: t("settings.devices.mobile.enrollFailedToast"),
          message: msg || t("settings.hub.mobile.biometricEnableFailedDefault"),
        })
      }
    } finally {
      setEnrollingWithMfa(false)
    }
  }

  const handleClearCache = () => {
    haptics.warning()
    Alert.alert(
      t("settings.hub.mobile.clearCacheTitle"),
      t("settings.hub.mobile.clearCacheDesc"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.hub.mobile.clearCacheBtn"),
          style: "destructive",
          onPress: async () => {
            setClearingCache(true)
            try {
              await AsyncStorage.removeItem("SATURN_QUERY_OFFLINE_CACHE")
              queryClient.clear()
              await queryClient.invalidateQueries()
              haptics.success()
              toast.show({
                type: "success",
                title: t("settings.hub.mobile.cacheClearedToast"),
                message: t("settings.hub.mobile.cacheClearedToastDesc"),
              })
            } catch (err: any) {
              haptics.error()
              toast.show({
                type: "error",
                title: t("settings.hub.mobile.clearFailedToast"),
                message:
                  err?.message ||
                  t("settings.hub.mobile.clearFailedToastDefault"),
              })
            } finally {
              setClearingCache(false)
            }
          },
        },
      ]
    )
  }

  const appVersion = Constants.expoConfig?.version || "0.0.2"

  return (
    <View style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {/* User Profile Overview Card */}
        <Card style={styles.profileCard}>
          <View style={styles.avatarWrapper}>
            <Avatar name={user?.name || "User"} size={54} />
            <View style={styles.verifiedBadge}>
              <CheckCircle2 size={12} color="#ffffff" />
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>
              {user?.name || t("menu.saturnUser")}
            </Text>
            {user?.username && (
              <Text style={styles.profileUsername}>@{user.username}</Text>
            )}
            <Text style={styles.profileEmail}>
              {user?.email || "user@saturn.local"}
            </Text>
            {user?.id && (
              <Text style={styles.profileId} numberOfLines={1}>
                {user.id}
              </Text>
            )}
            <View style={styles.profileBadgeRow}>
              <Badge
                variant={user?.role === "admin" ? "primary" : "default"}
                size="sm"
                label={
                  user?.role === "admin"
                    ? t("settings.hub.mobile.roleSystemAdmin")
                    : t("settings.hub.mobile.roleActiveMember")
                }
              />
            </View>
          </View>
        </Card>

        {/* Section 1: Workspace & Finance */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            {t("settings.hub.mobile.sectionWorkspaceFinance").toUpperCase()}
          </Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => router.push("/modal/switch-space")}
            >
              <View style={styles.menuLeft}>
                <Layers size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.activeWorkspace")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={styles.menuValue}>
                  {activeSpace?.name ||
                    t("settings.hub.mobile.personalWorkspace")}
                </Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => router.push("/(app)/settings/space")}
            >
              <View style={styles.menuLeft}>
                <Users size={18} color={colors.accent} />
                <Text style={styles.menuLabel}>
                  {t("menu.workspaceDetails")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Badge
                  variant={activeSpaceRole === "owner" ? "primary" : "default"}
                  size="sm"
                  label={t(
                    activeSpaceRole === "owner"
                      ? "settings.spaces.roleOwner"
                      : activeSpaceRole === "admin"
                        ? "settings.spaces.roleAdmin"
                        : activeSpaceRole === "viewer"
                          ? "settings.spaces.roleViewer"
                          : "settings.spaces.roleMember"
                  ).toUpperCase()}
                />
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => {
                haptics.light()
                router.push("/(app)/settings/connected-accounts")
              }}
            >
              <View style={styles.menuLeft}>
                <Link2 size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>
                  {t("settings.connectors.connectedAccountsTitle")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => {
                haptics.light()
                router.push("/(app)/workflows" as never)
              }}
            >
              <View style={styles.menuLeft}>
                <Workflow size={18} color={colors.accent} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.workflows")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={styles.menuLeft}>
                <Coins size={18} color={colors.success} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.baseCurrency")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Badge variant="outline" size="sm" label={baseCurrency} />
              </View>
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                haptics.light()
                setFiscalYearModalVisible(true)
              }}
            >
              <View style={styles.menuLeft}>
                <Calendar size={18} color={colors.info} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.fiscalYearStart")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={styles.menuValue}>
                  {formatMonthName(currentFiscalMonth, language)}
                </Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 2: Security & Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            {t("settings.hub.mobile.securitySection").toUpperCase()}
          </Text>
          <Card style={styles.menuGroup}>
            {isBiometricSupported && (
              <View style={[styles.menuItem, styles.menuItemBorder]}>
                <View style={styles.menuLeft}>
                  <Fingerprint size={18} color={colors.primary} />
                  <Text style={styles.menuLabel}>
                    {t("settings.hub.mobile.biometricUnlock")}
                  </Text>
                </View>
                <Switch
                  value={isBiometricActive}
                  onValueChange={(val) => {
                    handleToggleBiometrics(val)
                  }}
                  trackColor={{
                    false: colors.surfaceHighlight,
                    true: colors.primary,
                  }}
                  thumbColor="#ffffff"
                />
              </View>
            )}

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => router.push("/(app)/settings/security")}
            >
              <View style={styles.menuLeft}>
                <ShieldCheck size={18} color={colors.success} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.activeSessionsDevices")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Badge
                  variant="primary"
                  size="sm"
                  label={t(
                    sessionCount === 1
                      ? "settings.hub.mobile.deviceCountOne"
                      : "settings.hub.mobile.deviceCountOther",
                    { count: sessionCount }
                  )}
                />
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                haptics.light()
                router.push("/(app)/settings/api-keys")
              }}
            >
              <View style={styles.menuLeft}>
                <KeyRound size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>
                  {t("settings.apiKeys.title")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 3: Appearance */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            {t("settings.hub.mobile.appearanceSection").toUpperCase()}
          </Text>
          <Card style={styles.appearanceCard}>
            <View style={styles.appearanceHeader}>
              <Text style={styles.menuLabel}>
                {t("settings.hub.mobile.themeMode")}
              </Text>
              <Text style={styles.menuValue}>
                {mode === "system"
                  ? t("settings.hub.mobile.themeMatchesDevice")
                  : mode === "light"
                    ? t("menu.light")
                    : t("menu.dark")}
              </Text>
            </View>
            <View style={styles.segmentedTrack}>
              {APPEARANCE_OPTIONS.map(({ value, labelKey, Icon }) => {
                const isActive = mode === value
                const label = t(labelKey)
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.segmentedOption,
                      isActive && styles.segmentedOptionActive,
                    ]}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={t("menu.appearanceAria", { label })}
                    onPress={() => {
                      haptics.selection()
                      setMode(value)
                    }}
                  >
                    <Icon
                      size={15}
                      color={
                        isActive ? colors.primaryForeground : colors.textMuted
                      }
                    />
                    <Text
                      style={[
                        styles.segmentedLabel,
                        isActive && styles.segmentedLabelActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </Card>
        </View>

        {/* Section 3B: Language & Regional Format */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            {t("settings.regional.title").toUpperCase()}
          </Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => {
                haptics.light()
                setLanguageModalVisible(true)
              }}
              testID="settings-language-selector"
              accessibilityRole="button"
              accessibilityLabel={t("settings.regional.language")}
            >
              <View style={styles.menuLeft}>
                <Globe size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>
                  {t("settings.regional.language")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={styles.menuValue}>{activeLocaleOption.label}</Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <View style={[styles.regionalBlock, styles.menuItemBorder]}>
              <Text style={styles.menuLabel}>
                {t("settings.regional.hourCycle")}
              </Text>
              <View
                style={styles.segmentedTrack}
                testID="settings-hour-cycle-selector"
              >
                {(
                  [
                    { value: "h12", label: t("settings.regional.hour12") },
                    { value: "h23", label: t("settings.regional.hour24") },
                  ] as const
                ).map((option) => {
                  const isActive = hourCycle === option.value
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.segmentedOption,
                        isActive && styles.segmentedOptionActive,
                      ]}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={option.label}
                      onPress={() => {
                        if (hourCycle !== option.value) {
                          void handleUpdateRegional({
                            hourCycle: option.value,
                          })
                        }
                      }}
                      testID={`settings-hour-cycle-${option.value}`}
                    >
                      <Text
                        style={[
                          styles.segmentedLabel,
                          isActive && styles.segmentedLabelActive,
                        ]}
                        numberOfLines={1}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={styles.regionalBlock}>
              <Text style={styles.menuLabel}>
                {t("settings.regional.weekStartsOn")}
              </Text>
              <View
                style={styles.segmentedTrack}
                testID="settings-week-start-selector"
              >
                {(
                  [
                    { value: 0, label: t("settings.regional.sunday") },
                    { value: 1, label: t("settings.regional.monday") },
                  ] as const
                ).map((option) => {
                  const isActive = weekStartsOn === option.value
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.segmentedOption,
                        isActive && styles.segmentedOptionActive,
                      ]}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={option.label}
                      onPress={() => {
                        if (weekStartsOn !== option.value) {
                          void handleUpdateRegional({
                            weekStartsOn: option.value,
                          })
                        }
                      }}
                      testID={`settings-week-start-${option.value}`}
                    >
                      <Text
                        style={[
                          styles.segmentedLabel,
                          isActive && styles.segmentedLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>
          </Card>
        </View>

        {/* Section 4: Preferences & Integrations */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            {t("settings.hub.mobile.prefsSection").toUpperCase()}
          </Text>
          <Card style={styles.menuGroup}>
            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={[styles.menuLeft, { flex: 1, paddingRight: 12 }]}>
                <Mail size={18} color={colors.primary} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.menuLabel}>
                    {t("settings.mail.autoLoadRemoteContentLabel")}
                  </Text>
                  <Text style={styles.menuSublabel}>
                    {t("settings.mail.autoLoadRemoteContentDesc")}
                  </Text>
                </View>
              </View>
              <Switch
                testID="settings-mail-auto-load-switch"
                accessibilityLabel={t(
                  "settings.mail.autoLoadRemoteContentLabel"
                )}
                value={mailAutoLoadRemoteContent}
                onValueChange={(val) => {
                  void handleToggleMailAutoLoad(val)
                }}
                trackColor={{
                  false: colors.surfaceHighlight,
                  true: colors.primary,
                }}
                thumbColor="#ffffff"
              />
            </View>

            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={styles.menuLeft}>
                <Bell size={18} color={colors.warning} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.notifications")}
                </Text>
              </View>
              <Badge size="sm" label={t("settings.hub.mobile.soon")} />
            </View>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                haptics.light()
                router.push("/(app)/ai/agents" as never)
              }}
            >
              <View style={styles.menuLeft}>
                <Sparkles size={18} color={colors.accent} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.aiAgents")}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Card>
        </View>

        {/* Section 5: Storage & System Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>
            {t("settings.hub.mobile.storageSection").toUpperCase()}
          </Text>
          <Card style={styles.menuGroup}>
            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={() => router.push("/server-settings")}
            >
              <View style={styles.menuLeft}>
                <Globe size={18} color={colors.primary} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.serverHost")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={styles.menuValue} numberOfLines={1}>
                  {serverUrl.replace(/^https?:\/\//, "")}
                </Text>
                <ChevronRight size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemBorder]}
              activeOpacity={0.7}
              onPress={handleClearCache}
              disabled={clearingCache}
            >
              <View style={styles.menuLeft}>
                <HardDrive size={18} color={colors.info} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.clearCache")}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.menuItem}>
              <View style={styles.menuLeft}>
                <Info size={18} color={colors.textMuted} />
                <Text style={styles.menuLabel}>
                  {t("settings.hub.mobile.appVersion")}
                </Text>
              </View>
              <View style={styles.menuRight}>
                <Text style={styles.menuValue}>v{appVersion}</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Sign Out Button */}
        <Button
          variant="destructive"
          size="lg"
          leftIcon={<LogOut size={18} color={colors.destructive} />}
          onPress={() => setSignOutModalVisible(true)}
        >
          {t("auth.signOut")}
        </Button>

        {/* Sign Out Confirmation Dialog */}
        <ConfirmDialog
          visible={signOutModalVisible}
          title={t("auth.signOut")}
          message={t("settings.hub.mobile.signOutDesc")}
          confirmText={t("auth.signOut")}
          cancelText={t("common.cancel")}
          isDestructive
          loading={signingOut}
          onConfirm={handleConfirmSignOut}
          onCancel={() => setSignOutModalVisible(false)}
        />

        {/* MFA Step-up Modal */}
        <MfaStepUpModal
          visible={mfaModalVisible}
          onClose={() => {
            setMfaModalVisible(false)
            setMfaError(null)
          }}
          onConfirm={handleMfaEnroll}
          loading={enrollingWithMfa}
          error={mfaError}
        />

        {/* Fiscal Year Modal */}
        <Modal
          visible={fiscalYearModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setFiscalYearModalVisible(false)}
        >
          <View
            style={[
              styles.modalContainer,
              Platform.OS === "android" && {
                paddingTop: Math.max(insets.top, 16),
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {t("settings.hub.mobile.fiscalYearStart")}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {t("settings.hub.mobile.fiscalModalDesc")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setFiscalYearModalVisible(false)}
                style={styles.closeBtn}
              >
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={FISCAL_YEAR_MONTHS}
              keyExtractor={(item) => String(item.month)}
              renderItem={({ item }) => {
                const isSelected = item.month === currentFiscalMonth
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemActive,
                    ]}
                    onPress={() => handleSelectFiscalYear(item.month)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.modalItemText,
                          isSelected && styles.modalItemTextActive,
                        ]}
                      >
                        {formatMonthName(item.month, language)}
                      </Text>
                      <Text style={styles.modalItemDescription}>
                        {t(
                          FISCAL_MONTH_DESCRIPTION_KEYS[item.description] ??
                            "settings.finance.monthDescCustom"
                        )}
                      </Text>
                    </View>
                    {isSelected && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                )
              }}
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          </View>
        </Modal>

        {/* Language Selection Modal */}
        <Modal
          visible={languageModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setLanguageModalVisible(false)}
        >
          <View
            style={[
              styles.modalContainer,
              Platform.OS === "android" && {
                paddingTop: Math.max(insets.top, 16),
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>
                  {t("settings.regional.language")}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {t("settings.regional.description")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setLanguageModalVisible(false)}
                style={styles.closeBtn}
                accessibilityLabel={t("common.close")}
              >
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[...supportedLocales]}
              keyExtractor={(item) => item.value}
              renderItem={({ item }) => {
                const isSelected = item.value === locale
                return (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      isSelected && styles.modalItemActive,
                    ]}
                    onPress={() => {
                      setLanguageModalVisible(false)
                      if (item.value !== locale) {
                        void handleUpdateRegional({ locale: item.value })
                      }
                    }}
                    activeOpacity={0.7}
                    testID={`settings-language-option-${item.value}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.modalItemText,
                          isSelected && styles.modalItemTextActive,
                        ]}
                      >
                        {item.label}
                      </Text>
                      <Text style={styles.modalItemDescription}>
                        {item.value}
                      </Text>
                    </View>
                    {isSelected && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                )
              }}
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          </View>
        </Modal>
      </ScrollView>
    </View>
  )
}

const createStyles = (t: SaturnMobileTheme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
    gap: 20,
  },
  profileCard: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    padding: 16,
    gap: 16,
  },
  avatarWrapper: {
    position: "relative" as const,
  },
  verifiedBadge: {
    position: "absolute" as const,
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.colors.success,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 2,
    borderColor: t.colors.surface,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "bold" as const,
    color: t.colors.textPrimary,
  },
  profileUsername: {
    fontSize: 12,
    color: t.colors.primary,
    fontWeight: "500" as const,
  },
  profileEmail: {
    fontSize: 13,
    color: t.colors.textMuted,
  },
  profileId: {
    fontSize: 10,
    fontFamily: "monospace",
    color: t.colors.textMuted,
    opacity: 0.7,
  },
  profileBadgeRow: {
    marginTop: 4,
    flexDirection: "row" as const,
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700" as const,
    color: t.colors.textMuted,
    paddingHorizontal: 4,
    letterSpacing: 0.8,
  },
  menuGroup: {
    overflow: "hidden" as const,
  },
  menuItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  menuLeft: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  menuLabel: {
    fontSize: 15,
    color: t.colors.textPrimary,
  },
  menuSublabel: {
    fontSize: 12,
    color: t.colors.textMuted,
  },
  menuRight: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
  },
  menuValue: {
    fontSize: 14,
    color: t.colors.textMuted,
  },
  appearanceCard: {
    padding: 14,
    gap: 12,
  },
  regionalBlock: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  appearanceHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  segmentedTrack: {
    flexDirection: "row" as const,
    backgroundColor: t.colors.surfaceSubtle,
    borderRadius: t.radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    padding: 3,
    gap: 4,
  },
  segmentedOption: {
    flex: 1,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 8,
    borderRadius: t.radius.sm,
  },
  segmentedOptionActive: {
    backgroundColor: t.colors.primary,
  },
  segmentedLabel: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: t.colors.textMuted,
  },
  segmentedLabelActive: {
    color: t.colors.primaryForeground,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: t.colors.background,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: t.colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 13,
    color: t.colors.textMuted,
    marginTop: 4,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.surface,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  modalItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.border,
  },
  modalItemActive: {
    backgroundColor: t.colors.primarySubtle,
  },
  modalItemText: {
    fontSize: 15,
    color: t.colors.textPrimary,
  },
  modalItemTextActive: {
    color: t.colors.primary,
    fontWeight: "600" as const,
  },
  modalItemDescription: {
    fontSize: 12,
    color: t.colors.textMuted,
    marginTop: 2,
  },
})
