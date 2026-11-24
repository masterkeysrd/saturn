import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/features/auth/use-auth"
import {
  useUpdateProfileMutation,
  useChangeEmailMutation,
  useDeleteAccountMutation,
  useListMFAFactorsQuery,
  useGetUserPreferencesQuery,
  useUpdateUserPreferencesMutation,
  type UserPreferences,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  SUPPORTED_UI_LOCALES,
  normalizeUserLocale,
  translate,
} from "@saturn/i18n"
import {
  useI18n,
  useTimezone,
  type HourCycle,
  type WeekStartsOn,
} from "@saturn/hooks"
import {
  getCachedUserPreferences,
  normalizeCachedUserPreferences,
  setCachedUserPreferences,
  type CachedUserPreferences,
  type UserPreferencesPatch,
} from "@/lib/user-preferences"
import {
  UserIcon,
  MailIcon,
  HashIcon,
  BadgeCheckIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  PencilIcon,
  CheckIcon,
  CopyIcon,
  XIcon,
  Loader2Icon,
  AlertTriangleIcon,
  Trash2Icon,
  GlobeIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { InputOTP } from "@/components/ui/input-otp"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/toast"

export function AccountSettingsView() {
  const { user, logoutUser } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const tz = useTimezone()

  // MFA Status
  const { data: mfaData } = useListMFAFactorsQuery({})
  const factors = mfaData?.factors || []
  const hasActiveMFA = factors.length > 0

  // User Preferences
  const { data: userPrefsData } = useGetUserPreferencesQuery({})
  const updateUserPrefsMutation = useUpdateUserPreferencesMutation()

  const cachedUserPrefs = getCachedUserPreferences()
  const currentLocale = userPrefsData?.regional?.locale
    ? normalizeUserLocale(userPrefsData.regional.locale)
    : tz.locale
  const currentHourCycle: HourCycle =
    (userPrefsData?.regional?.hourCycle ?? tz.hourCycle) === "h23"
      ? "h23"
      : "h12"
  const currentWeekStartsOn: WeekStartsOn =
    (userPrefsData?.regional?.weekStartsOn ?? tz.weekStartsOn) === 1 ? 1 : 0
  const currentAutoLoadRemoteContent =
    userPrefsData?.mail?.autoLoadRemoteContent ??
    cachedUserPrefs.mail.autoLoadRemoteContent
  const currentCalendarWebView =
    userPrefsData?.calendar?.webView ?? cachedUserPrefs.calendar.webView
  const currentCalendarMobileView =
    userPrefsData?.calendar?.mobileView ?? cachedUserPrefs.calendar.mobileView

  // Mutations
  const updateProfileMutation = useUpdateProfileMutation()
  const changeEmailMutation = useChangeEmailMutation()
  const deleteAccountMutation = useDeleteAccountMutation()

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [nameInput, setNameInput] = useState(user?.name || "")
  const [avatarUrlInput, setAvatarUrlInput] = useState(user?.avatarUrl || "")

  // Copy ID State
  const [copiedId, setCopiedId] = useState(false)

  // Change Email Modal State
  const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false)
  const [emailStep, setEmailStep] = useState<"form" | "mfa">("form")
  const [newEmail, setNewEmail] = useState("")
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("")
  const [emailTotpCode, setEmailTotpCode] = useState("")
  const [emailError, setEmailError] = useState<string | null>(null)

  // Delete Account Modal State
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteStep, setDeleteStep] = useState<"form" | "mfa">("form")
  const [deletePassword, setDeletePassword] = useState("")
  const [deleteTotpCode, setDeleteTotpCode] = useState("")
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const initials = (user?.name || user?.username || "U")
    .substring(0, 2)
    .toUpperCase()

  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    }
  }

  const handleStartEditProfile = () => {
    setNameInput(user?.name || "")
    setAvatarUrlInput(user?.avatarUrl || "")
    setIsEditingProfile(true)
  }

  const handleCancelEditProfile = () => {
    setIsEditingProfile(false)
    setNameInput(user?.name || "")
    setAvatarUrlInput(user?.avatarUrl || "")
  }

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault()
    if (!nameInput.trim()) return

    try {
      await updateProfileMutation.mutateAsync({
        name: nameInput.trim(),
        avatarUrl: avatarUrlInput.trim() || undefined,
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/identity/users/me"],
      })
      setIsEditingProfile(false)
      toast.add({
        type: "success",
        title: t("settings.profile.profileOk"),
        description: t("settings.profile.profileOkBody"),
      })
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : t("settings.profile.profileFailedDefault")
      toast.add({
        type: "error",
        title: t("settings.profile.profileFailed"),
        description: msg,
      })
    }
  }

  // Change Email Handlers
  const handleOpenChangeEmail = () => {
    setNewEmail("")
    setEmailCurrentPassword("")
    setEmailTotpCode("")
    setEmailError(null)
    setEmailStep("form")
    setIsChangeEmailOpen(true)
  }

  const handleEmailFormSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setEmailError(null)

    if (!newEmail.trim() || !emailCurrentPassword) {
      setEmailError(t("settings.profile.changeEmailErrorRequired"))
      return
    }

    if (hasActiveMFA) {
      setEmailStep("mfa")
      return
    }

    await executeChangeEmail("")
  }

  const executeChangeEmail = async (code: string) => {
    try {
      await changeEmailMutation.mutateAsync({
        newEmail: newEmail.trim(),
        currentPassword: emailCurrentPassword,
        totpCode: code,
      })
      await queryClient.invalidateQueries({
        queryKey: ["/api/v1/identity/users/me"],
      })
      setIsChangeEmailOpen(false)
      setNewEmail("")
      setEmailCurrentPassword("")
      setEmailTotpCode("")
      toast.add({
        type: "success",
        title: t("settings.profile.emailUpdated"),
        description: t("settings.profile.emailUpdatedBody"),
      })
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : t("settings.profile.changeEmailFailedDefault")
      setEmailError(msg)
      toast.add({
        type: "error",
        title: t("settings.profile.changeEmailFailed"),
        description: msg,
      })
    }
  }

  // Delete Account Handlers
  const handleOpenDelete = () => {
    setDeletePassword("")
    setDeleteTotpCode("")
    setDeleteConfirmText("")
    setDeleteError(null)
    setDeleteStep("form")
    setIsDeleteOpen(true)
  }

  const handleDeleteFormSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setDeleteError(null)

    if (
      deleteConfirmText.toLowerCase() !==
      t("settings.profile.deleteAccountSentinel")
    ) {
      setDeleteError(t("settings.profile.deleteAccountErrorType"))
      return
    }
    if (!deletePassword) {
      setDeleteError(t("settings.profile.deleteAccountErrorPassword"))
      return
    }

    if (hasActiveMFA) {
      setDeleteStep("mfa")
      return
    }

    await executeDeleteAccount("")
  }

  const executeDeleteAccount = async (code: string) => {
    try {
      await deleteAccountMutation.mutateAsync({
        currentPassword: deletePassword,
        totpCode: code,
      })
      toast.add({
        type: "success",
        title: t("settings.profile.deleteAccountOk"),
        description: t("settings.profile.deleteAccountOkBody"),
      })
      setIsDeleteOpen(false)
      await logoutUser()
      navigate("/login")
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : t("settings.profile.deleteAccountFailedDefault")
      setDeleteError(msg)
      toast.add({
        type: "error",
        title: t("settings.profile.deleteAccountFailed"),
        description: msg,
      })
    }
  }

  const handleUpdateUserPrefs = async (
    patch: UserPreferencesPatch,
    paths: string[],
    getSuccessTitle?: (updated: CachedUserPreferences) => string
  ) => {
    const previous = queryClient.getQueryData<UserPreferences>([
      "/api/v1/identity/users/me/preferences",
      {},
    ])
    const previousCached = getCachedUserPreferences()
    const next = normalizeCachedUserPreferences(
      {
        regional: {
          locale: patch.regional?.locale ?? currentLocale,
          hourCycle: patch.regional?.hourCycle ?? currentHourCycle,
          weekStartsOn: patch.regional?.weekStartsOn ?? currentWeekStartsOn,
        },
        mail: {
          autoLoadRemoteContent:
            patch.mail?.autoLoadRemoteContent ?? currentAutoLoadRemoteContent,
        },
        calendar: {
          webView: patch.calendar?.webView ?? currentCalendarWebView,
          mobileView: patch.calendar?.mobileView ?? currentCalendarMobileView,
        },
      },
      currentLocale
    )
    queryClient.setQueryData(
      ["/api/v1/identity/users/me/preferences", {}],
      next
    )
    setCachedUserPreferences(next)

    try {
      const updated = await updateUserPrefsMutation.mutateAsync({
        userPreferences: next,
        updateMask: { paths },
      })
      const normalizedUpdated = normalizeCachedUserPreferences(
        updated,
        next.regional.locale
      )
      queryClient.setQueryData(
        ["/api/v1/identity/users/me/preferences", {}],
        normalizedUpdated
      )
      setCachedUserPreferences(normalizedUpdated)
      toast.add({
        type: "success",
        title: getSuccessTitle
          ? getSuccessTitle(normalizedUpdated)
          : translate(
              normalizedUpdated.regional.locale,
              "settings.regional.saved"
            ),
      })
    } catch (err: unknown) {
      if (previous) {
        const normalizedPrevious = normalizeCachedUserPreferences(previous)
        queryClient.setQueryData(
          ["/api/v1/identity/users/me/preferences", {}],
          normalizedPrevious
        )
        setCachedUserPreferences(normalizedPrevious)
      } else {
        queryClient.setQueryData(
          ["/api/v1/identity/users/me/preferences", {}],
          previousCached
        )
        setCachedUserPreferences(previousCached)
      }
      const msg =
        err instanceof Error
          ? err.message
          : t("settings.profile.prefFailedDefault")
      toast.add({
        type: "error",
        title: msg,
      })
    }
  }

  return (
    <div className="space-y-8">
      {/* Profile Overview Banner */}
      <div className="flex items-center gap-4 rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm select-none dark:bg-card/45">
        <div className="relative">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name || t("settings.profile.avatarAlt")}
              referrerPolicy="no-referrer"
              className="h-16 w-16 rounded-2xl object-cover shadow-lg shadow-primary/20"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
              {initials}
            </div>
          )}
          <div className="absolute -right-1 -bottom-1 flex h-5 w-5 items-center justify-center rounded bg-green-500 text-white shadow-md">
            <BadgeCheckIcon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="flex flex-col text-left">
          <h2 className="text-lg font-bold text-foreground">{user?.name}</h2>
          <p className="text-xs text-muted-foreground">
            @{user?.username || "username"}
          </p>
        </div>
      </div>

      {/* Account Details & Profile Edit */}
      <div className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs select-none">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <h3 className="text-base font-semibold text-foreground">
              {t("settings.profile.profileDetails")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.profile.profileDesc")}
            </p>
          </div>
          {!isEditingProfile && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartEditProfile}
              className="h-8 cursor-pointer gap-1.5 text-xs"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              {t("settings.profile.editProfile")}
            </Button>
          )}
        </div>

        {isEditingProfile ? (
          <form
            onSubmit={handleSaveProfile}
            className="mt-5 space-y-4 text-left"
          >
            <div className="space-y-1.5">
              <Label
                htmlFor="edit-name"
                className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
              >
                {t("settings.profile.profileEditNameLabel")}
              </Label>
              <Input
                id="edit-name"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder={t("settings.profile.profileEditNamePlaceholder")}
                required
                className="max-w-md text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="edit-avatar"
                className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
              >
                {t("settings.profile.profileEditAvatarLabel")}
              </Label>
              <Input
                id="edit-avatar"
                value={avatarUrlInput}
                onChange={(e) => setAvatarUrlInput(e.target.value)}
                placeholder={t("settings.profile.profileEditAvatarPlaceholder")}
                className="max-w-md text-sm"
              />
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                size="sm"
                disabled={updateProfileMutation.isPending}
                className="h-8 cursor-pointer gap-1.5 text-xs"
              >
                {updateProfileMutation.isPending && (
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
                )}
                {t("settings.profile.saveChanges")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelEditProfile}
                disabled={updateProfileMutation.isPending}
                className="h-8 cursor-pointer gap-1.5 text-xs"
              >
                <XIcon className="h-3.5 w-3.5" />
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-5 divide-y divide-border/30 border-t border-border/40">
            <div className="flex items-center justify-between py-4 transition-colors first:pt-4 last:pb-0">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground">
                  <UserIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                    {t("settings.profile.fullName")}
                  </span>
                  <span className="mt-1 text-sm font-medium text-foreground">
                    {user?.name}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between py-4 transition-colors first:pt-4 last:pb-0">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground">
                  <MailIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                    {t("settings.profile.emailAddress")}
                  </span>
                  <span className="mt-1 text-sm font-medium text-foreground">
                    {user?.email}
                  </span>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenChangeEmail}
                className="h-8 cursor-pointer text-xs"
              >
                {t("settings.profile.changeEmail")}
              </Button>
            </div>

            <div className="flex items-center justify-between py-4 transition-colors first:pt-4 last:pb-0">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 text-foreground">
                  <HashIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex flex-col overflow-hidden text-left">
                  <span className="text-[10px] leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                    {t("settings.profile.userIdentifier")}
                  </span>
                  <span className="mt-1 max-w-xs truncate font-mono text-xs text-foreground/80">
                    {user?.id}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyId}
                className="h-8 cursor-pointer gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                title={t("settings.profile.copyUserId")}
              >
                {copiedId ? (
                  <>
                    <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                    <span className="text-green-500">
                      {t("settings.profile.copied")}
                    </span>
                  </>
                ) : (
                  <>
                    <CopyIcon className="h-3.5 w-3.5" />
                    <span>{t("settings.profile.copy")}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Language & Regional Format */}
      <Card className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs select-none">
        <div className="flex items-start gap-3.5 text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <GlobeIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {t("settings.regional.title")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.regional.description")}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-5 border-t border-border/40 pt-5 text-left sm:grid-cols-3">
          <div className="space-y-2">
            <Label
              htmlFor="regional-locale-select"
              className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              {t("settings.regional.language")}
            </Label>
            <Select
              value={currentLocale}
              disabled={updateUserPrefsMutation.isPending}
              onValueChange={(val) => {
                if (val && val !== currentLocale) {
                  void handleUpdateUserPrefs({ regional: { locale: val } }, [
                    "regional.locale",
                  ])
                }
              }}
            >
              <SelectTrigger
                id="regional-locale-select"
                aria-label={t("settings.regional.language")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_UI_LOCALES.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="regional-hour-cycle-select"
              className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              {t("settings.regional.hourCycle")}
            </Label>
            <Select
              value={currentHourCycle}
              disabled={updateUserPrefsMutation.isPending}
              onValueChange={(val) => {
                if (
                  (val === "h12" || val === "h23") &&
                  val !== currentHourCycle
                ) {
                  void handleUpdateUserPrefs({ regional: { hourCycle: val } }, [
                    "regional.hour_cycle",
                  ])
                }
              }}
            >
              <SelectTrigger
                id="regional-hour-cycle-select"
                aria-label={t("settings.regional.hourCycle")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="h12">
                  {t("settings.regional.hour12")}
                </SelectItem>
                <SelectItem value="h23">
                  {t("settings.regional.hour24")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="regional-week-start-select"
              className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              {t("settings.regional.weekStartsOn")}
            </Label>
            <Select
              value={String(currentWeekStartsOn)}
              disabled={updateUserPrefsMutation.isPending}
              onValueChange={(val) => {
                if (val === "0" || val === "1") {
                  const nextDay: WeekStartsOn = val === "1" ? 1 : 0
                  if (nextDay !== currentWeekStartsOn) {
                    void handleUpdateUserPrefs(
                      { regional: { weekStartsOn: nextDay } },
                      ["regional.week_starts_on"]
                    )
                  }
                }
              }}
            >
              <SelectTrigger
                id="regional-week-start-select"
                aria-label={t("settings.regional.weekStartsOn")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">
                  {t("settings.regional.sunday")}
                </SelectItem>
                <SelectItem value="1">
                  {t("settings.regional.monday")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Mail Preferences */}
      <Card className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs select-none">
        <div className="flex items-start gap-3.5 text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <MailIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {t("settings.mail.title")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.mail.description")}
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-4 border-t border-border/40 pt-5 text-left">
          <div className="space-y-1">
            <Label
              htmlFor="mail-auto-load-remote-switch"
              className="text-sm font-medium text-foreground"
            >
              {t("settings.mail.autoLoadRemoteContentLabel")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t("settings.mail.autoLoadRemoteContentDesc")}
            </p>
          </div>
          <Switch
            id="mail-auto-load-remote-switch"
            data-testid="mail-auto-load-remote-switch"
            aria-label={t("settings.mail.autoLoadRemoteContentLabel")}
            checked={currentAutoLoadRemoteContent}
            disabled={updateUserPrefsMutation.isPending}
            onCheckedChange={(checked) => {
              void handleUpdateUserPrefs(
                { mail: { autoLoadRemoteContent: checked } },
                ["mail.auto_load_remote_content"],
                (updated) =>
                  translate(
                    updated.regional.locale,
                    updated.mail.autoLoadRemoteContent
                      ? "mail.autoLoadEnabledToast"
                      : "mail.autoLoadDisabledToast"
                  )
              )
            }}
          />
        </div>
      </Card>

      {/* Security & Logins Shortcut */}
      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-card/60 p-5 shadow-xs select-none sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheckIcon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {t("settings.profile.securityShortcutTitle")}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t("settings.profile.securityShortcutDesc")}
            </p>
          </div>
        </div>
        <Link to="/settings/security/credentials" className="shrink-0">
          <Button variant="outline" size="sm" className="cursor-pointer">
            {t("settings.profile.manageSecurity")}
            <ArrowRightIcon className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {/* Danger Zone: Account Deletion */}
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 shadow-xs select-none dark:bg-destructive/10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5 text-left">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertTriangleIcon className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">
                {t("settings.profile.dangerZone")}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("settings.profile.dangerZoneDesc")}
              </p>
            </div>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleOpenDelete}
            className="shrink-0 cursor-pointer"
          >
            <Trash2Icon className="mr-1.5 h-3.5 w-3.5" />
            {t("settings.profile.deleteAccount")}
          </Button>
        </div>
      </div>

      {/* Change Email Dialog */}
      <Dialog open={isChangeEmailOpen} onOpenChange={setIsChangeEmailOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle>
              {emailStep === "form"
                ? t("settings.profile.changeEmailTitleForm")
                : t("settings.profile.changeEmailTitleMfa")}
            </DialogTitle>
            <DialogDescription>
              {emailStep === "form"
                ? t("settings.profile.changeEmailDescForm")
                : t("settings.profile.changeEmailDescMfa")}
            </DialogDescription>
          </DialogHeader>

          {emailError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {emailError}
            </div>
          )}

          {emailStep === "form" ? (
            <form
              onSubmit={handleEmailFormSubmit}
              className="space-y-4 py-2 text-left"
            >
              <div className="space-y-1.5">
                <Label htmlFor="new-email" className="text-xs font-medium">
                  {t("settings.profile.newEmail")}
                </Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="name@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-password" className="text-xs font-medium">
                  {t("settings.profile.passwordCurrent")}
                </Label>
                <Input
                  id="email-password"
                  type="password"
                  placeholder={t("settings.profile.passwordPlaceholder")}
                  value={emailCurrentPassword}
                  onChange={(e) => setEmailCurrentPassword(e.target.value)}
                  required
                  className="text-sm"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsChangeEmailOpen(false)}
                  disabled={changeEmailMutation.isPending}
                  className="cursor-pointer"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={changeEmailMutation.isPending}
                  className="cursor-pointer"
                >
                  {changeEmailMutation.isPending && (
                    <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {hasActiveMFA
                    ? t("settings.profile.changeEmailBtnContinue")
                    : t("settings.profile.changeEmailBtnUpdate")}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4 py-2 text-center">
              <div className="flex flex-col items-center justify-center space-y-3 py-2">
                <Label
                  htmlFor="email-step-up-totp"
                  className="text-xs font-medium text-foreground"
                >
                  {t("settings.profile.verifyTotpLabel")}
                </Label>
                <InputOTP
                  id="email-step-up-totp"
                  value={emailTotpCode}
                  onChange={(val) => {
                    setEmailTotpCode(val)
                    if (emailError) setEmailError(null)
                  }}
                  onComplete={(val) => {
                    setEmailTotpCode(val)
                    executeChangeEmail(val)
                  }}
                  disabled={changeEmailMutation.isPending}
                  autoFocus
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEmailError(null)
                    setEmailStep("form")
                  }}
                  disabled={changeEmailMutation.isPending}
                  className="cursor-pointer gap-1.5"
                >
                  <ArrowLeftIcon className="h-3.5 w-3.5" />
                  {t("settings.profile.verifyBack")}
                </Button>
                <Button
                  type="button"
                  onClick={() => executeChangeEmail(emailTotpCode.trim())}
                  disabled={
                    changeEmailMutation.isPending ||
                    emailTotpCode.trim().length !== 6
                  }
                  className="cursor-pointer"
                >
                  {changeEmailMutation.isPending && (
                    <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {t("settings.profile.verifyUpdateEmail")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangleIcon className="h-5 w-5" />
              {deleteStep === "form"
                ? t("settings.profile.deleteAccount")
                : t("settings.profile.deleteAccountTitleMfa")}
            </DialogTitle>
            <DialogDescription>
              {deleteStep === "form"
                ? t("settings.profile.deleteAccountDescForm")
                : t("settings.profile.deleteAccountDescMfa")}
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {deleteError}
            </div>
          )}

          {deleteStep === "form" ? (
            <form
              onSubmit={handleDeleteFormSubmit}
              className="space-y-4 py-2 text-left"
            >
              <div className="space-y-1.5">
                <Label htmlFor="confirm-text" className="text-xs font-medium">
                  {t("settings.profile.deleteAccountConfirmPrefix")}{" "}
                  <span className="font-semibold text-destructive">
                    {t("settings.profile.deleteAccountSentinel")}
                  </span>{" "}
                  {t("settings.profile.deleteAccountConfirmSuffix")}
                </Label>
                <Input
                  id="confirm-text"
                  type="text"
                  placeholder={t("settings.profile.deleteAccountSentinel")}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  required
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="del-password" className="text-xs font-medium">
                  {t("settings.profile.passwordCurrent")}
                </Label>
                <Input
                  id="del-password"
                  type="password"
                  placeholder={t("settings.profile.passwordPlaceholder")}
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  required
                  className="text-sm"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDeleteOpen(false)}
                  disabled={deleteAccountMutation.isPending}
                  className="cursor-pointer"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={
                    deleteAccountMutation.isPending ||
                    deleteConfirmText.toLowerCase() !==
                      t("settings.profile.deleteAccountSentinel")
                  }
                  className="cursor-pointer"
                >
                  {deleteAccountMutation.isPending && (
                    <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {hasActiveMFA
                    ? t("settings.profile.changeEmailBtnContinue")
                    : t("settings.profile.deleteAccountBtnPermanent")}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4 py-2 text-center">
              <div className="flex flex-col items-center justify-center space-y-3 py-2">
                <Label
                  htmlFor="del-step-up-totp"
                  className="text-xs font-medium text-foreground"
                >
                  {t("settings.profile.verifyTotpLabel")}
                </Label>
                <InputOTP
                  id="del-step-up-totp"
                  value={deleteTotpCode}
                  onChange={(val) => {
                    setDeleteTotpCode(val)
                    if (deleteError) setDeleteError(null)
                  }}
                  onComplete={(val) => {
                    setDeleteTotpCode(val)
                    executeDeleteAccount(val)
                  }}
                  disabled={deleteAccountMutation.isPending}
                  autoFocus
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDeleteError(null)
                    setDeleteStep("form")
                  }}
                  disabled={deleteAccountMutation.isPending}
                  className="cursor-pointer gap-1.5"
                >
                  <ArrowLeftIcon className="h-3.5 w-3.5" />
                  {t("settings.profile.verifyBack")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => executeDeleteAccount(deleteTotpCode.trim())}
                  disabled={
                    deleteAccountMutation.isPending ||
                    deleteTotpCode.trim().length !== 6
                  }
                  className="cursor-pointer"
                >
                  {deleteAccountMutation.isPending && (
                    <Loader2Icon className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  )}
                  {t("settings.profile.deleteAccountBtnPermanent")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
