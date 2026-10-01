import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListUsersQuery,
  useApproveUserMutation,
  useRejectUserMutation,
  useResetPasswordMutation,
  useUnlockUserMutation,
  type ListUsersRequest_StatusFilter,
  type User,
} from "@saturn/api/gen/saturn/identity/admin/v1/admin_identity"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  BadgeCheckIcon,
  XCircleIcon,
  ShieldAlertIcon,
  RefreshCwIcon,
  UserIcon,
  KeyRoundIcon,
  CopyIcon,
  CheckIcon,
  ClockIcon,
  UnlockIcon,
} from "lucide-react"
import { PageLayout } from "@/components/ui/page-layout"

export function AdminView() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] =
    useState<ListUsersRequest_StatusFilter>("PENDING_APPROVAL")
  const [searchQuery, setSearchQuery] = useState("")

  // Password reset modal state
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [ttlMinutes, setTtlMinutes] = useState(15)
  const [generatedUrl, setGeneratedUrl] = useState("")
  const [copied, setCopied] = useState(false)
  const [now] = useState(() => Date.now())

  const resetPasswordMutation = useResetPasswordMutation()

  // Fetch the users list based on filters
  const { data, isLoading, isError, refetch } = useListUsersQuery({
    pageSize: 50,
    nextPageToken: "",
    statusFilter: statusFilter,
    searchQuery: searchQuery,
  })

  // Approve and Reject Mutations
  const approveMutation = useApproveUserMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/identity/users"],
      })
    },
  })

  const rejectMutation = useRejectUserMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/identity/users"],
      })
    },
  })

  const unlockMutation = useUnlockUserMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/v1/admin/identity/users"],
      })
      toast.add({
        type: "success",
        title: "Account Unlocked",
        description: "The user account has been unlocked successfully.",
      })
    },
    onError: (err) => {
      toast.add({
        type: "error",
        title: "Unlock Failed",
        description:
          err instanceof Error ? err.message : "Failed to unlock user account",
      })
    },
  })

  const handleApprove = async (userId: string) => {
    try {
      await approveMutation.mutateAsync({ user_id: userId, req: { userId } })
    } catch (err) {
      console.error("Failed to approve user:", err)
    }
  }

  const handleReject = async (userId: string) => {
    try {
      await rejectMutation.mutateAsync({ user_id: userId, req: { userId } })
    } catch (err) {
      console.error("Failed to reject user:", err)
    }
  }

  const handleUnlock = async (userId: string) => {
    try {
      await unlockMutation.mutateAsync({ user_id: userId, req: { userId } })
    } catch {
      // handled in onError
    }
  }

  const handleOpenResetModal = (user: User) => {
    setSelectedUser(user)
    setGeneratedUrl("")
    setTtlMinutes(15)
    setCopied(false)
    setResetModalOpen(true)
  }

  const handleGenerateResetLink = async () => {
    if (!selectedUser?.id) return
    try {
      const res = await resetPasswordMutation.mutateAsync({
        user_id: selectedUser.id,
        req: {
          userId: selectedUser.id,
          ttlMinutes,
        },
      })
      const fullUrl = res.resetUrl?.startsWith("http")
        ? res.resetUrl
        : `${window.location.origin}${res.resetUrl}`
      setGeneratedUrl(fullUrl)
    } catch (err) {
      console.error("Failed to generate reset link:", err)
    }
  }

  const handleCopy = () => {
    if (!generatedUrl) return
    navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const refreshButton = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => refetch()}
      disabled={isLoading}
      className="cursor-pointer self-start rounded-xl"
    >
      <RefreshCwIcon
        className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
      />
      Refresh
    </Button>
  )

  return (
    <PageLayout
      title="User Administration"
      description="Approve, deny, and manage Saturn user accounts."
      icon={UserIcon}
      actions={refreshButton}
    >
      {/* Filters and Search toolbar */}
      <div className="flex flex-col gap-4 select-none sm:flex-row sm:items-center">
        <div className="flex w-fit items-center gap-1.5 rounded-2xl border border-border/50 bg-muted/20 p-1">
          <button
            onClick={() => setStatusFilter("PENDING_APPROVAL")}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              statusFilter === "PENDING_APPROVAL"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending Approval
          </button>
          <button
            onClick={() => setStatusFilter("ACTIVE")}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              statusFilter === "ACTIVE"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Active Users
          </button>
          <button
            onClick={() => setStatusFilter("SUSPENDED")}
            className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              statusFilter === "SUSPENDED"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Suspended
          </button>
        </div>

        {/* Search Input bar */}
        <div className="relative max-w-sm flex-1">
          <input
            type="text"
            placeholder="Search name, username, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border border-border/60 bg-input/20 px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground/60 transition-all outline-none focus:border-primary/80 focus:ring-4 focus:ring-primary/15 dark:bg-input/10"
          />
        </div>
      </div>

      {/* Main Table Content section */}
      <div className="overflow-hidden rounded-3xl border border-border/50 bg-card/45 shadow-xl backdrop-blur-xl">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-20">
            <div className="relative flex items-center justify-center">
              <div className="absolute h-12 w-12 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary duration-1000" />
              <div className="h-4 w-4 animate-pulse rounded-full bg-gradient-to-tr from-primary to-accent" />
            </div>
            <span className="text-sm text-muted-foreground">
              Loading accounts list...
            </span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center space-y-3 px-4 py-20 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <ShieldAlertIcon className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              Failed to load users
            </h3>
            <p className="max-w-xs text-xs text-muted-foreground">
              An error occurred while fetching users from the identity gateway
              service.
            </p>
          </div>
        ) : !data?.users || data.users.length === 0 ? (
          <div className="flex flex-col items-center justify-center space-y-3 px-4 py-24 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40 text-muted-foreground">
              <UserIcon className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-bold text-foreground">
              No accounts found
            </h3>
            <p className="max-w-xs text-xs text-muted-foreground">
              There are currently no users matching the selected status or
              search filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/10 text-xs font-semibold text-muted-foreground select-none">
                  <th className="px-6 py-4">User Details</th>
                  <th className="px-6 py-4">Username</th>
                  <th className="px-6 py-4">Access Level</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {data.users.map((account) => {
                  const initials = (account.name || account.username || "U")
                    .substring(0, 2)
                    .toUpperCase()
                  const isPending = account.status === "pending_approval"
                  const isPendingOperation =
                    approveMutation.isPending || rejectMutation.isPending
                  const isLocked = Boolean(
                    account.lockedUntil &&
                    new Date(account.lockedUntil).getTime() > now
                  )

                  return (
                    <tr
                      key={account.id}
                      className="transition-colors hover:bg-muted/15"
                    >
                      {/* Name / Email Column */}
                      <td className="flex items-center gap-3 px-6 py-4.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-primary/15 to-accent/15 text-xs font-bold text-foreground select-none">
                          {initials}
                        </div>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-semibold text-foreground">
                            {account.name}
                          </span>
                          <span className="mt-0.5 truncate text-xs text-muted-foreground">
                            {account.email}
                          </span>
                        </div>
                      </td>

                      {/* Username Column */}
                      <td className="px-6 py-4.5 font-mono text-xs text-muted-foreground">
                        @{account.username}
                      </td>

                      {/* Access Level Column */}
                      <td className="px-6 py-4.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                            account.accessLevel === "ACCESS_LEVEL_ADMIN"
                              ? "border-purple-500/20 bg-purple-500/10 text-purple-400"
                              : "border-blue-500/20 bg-blue-500/10 text-blue-400"
                          }`}
                        >
                          {account.accessLevel === "ACCESS_LEVEL_ADMIN"
                            ? "Admin"
                            : "User"}
                        </span>
                      </td>

                      {/* Status Column */}
                      <td className="px-6 py-4.5">
                        <div className="flex flex-col gap-1">
                          {isLocked ? (
                            <span className="inline-flex w-fit items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                              Locked
                            </span>
                          ) : (
                            <span
                              className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                                account.status === "active"
                                  ? "border-green-500/20 bg-green-500/10 text-green-400"
                                  : account.status === "pending_approval"
                                    ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                                    : "border-destructive/20 bg-destructive/10 text-destructive"
                              }`}
                            >
                              {(account.status || "").replace("_", " ")}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions Column */}
                      <td className="px-6 py-4.5 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              onClick={() =>
                                account.id && handleReject(account.id)
                              }
                              disabled={isPendingOperation}
                              variant="ghost"
                              size="sm"
                              className="h-8 cursor-pointer rounded-xl px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <XCircleIcon className="mr-1.5 h-4 w-4" />
                              Deny
                            </Button>
                            <Button
                              onClick={() =>
                                account.id && handleApprove(account.id)
                              }
                              disabled={isPendingOperation}
                              className="h-8 cursor-pointer rounded-xl bg-green-600 px-3.5 text-white shadow-sm shadow-green-600/10 hover:bg-green-700"
                            >
                              <BadgeCheckIcon className="mr-1.5 h-4 w-4" />
                              Approve
                            </Button>
                          </div>
                        ) : account.status === "active" ? (
                          <div className="flex items-center justify-end gap-2">
                            {isLocked && (
                              <Button
                                onClick={() =>
                                  account.id && handleUnlock(account.id)
                                }
                                disabled={unlockMutation.isPending}
                                variant="outline"
                                size="sm"
                                className="h-8 cursor-pointer rounded-xl border-amber-500/30 px-3 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                              >
                                <UnlockIcon className="mr-1.5 h-3.5 w-3.5" />
                                Unlock Account
                              </Button>
                            )}
                            <Button
                              onClick={() => handleOpenResetModal(account)}
                              variant="ghost"
                              size="sm"
                              className="h-8 cursor-pointer rounded-xl px-3 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                            >
                              <KeyRoundIcon className="mr-1.5 h-3.5 w-3.5" />
                              Reset Password
                            </Button>
                          </div>
                        ) : isLocked ? (
                          <div className="flex items-center justify-end">
                            <Button
                              onClick={() =>
                                account.id && handleUnlock(account.id)
                              }
                              disabled={unlockMutation.isPending}
                              variant="outline"
                              size="sm"
                              className="h-8 cursor-pointer rounded-xl border-amber-500/30 px-3 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                            >
                              <UnlockIcon className="mr-1.5 h-3.5 w-3.5" />
                              Unlock Account
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/60 select-none">
                            No actions
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Password Reset Modal */}
      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Generate a single-use password reset link for{" "}
              <span className="font-semibold text-foreground">
                @{selectedUser?.username}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          {!generatedUrl ? (
            <div className="space-y-4 py-2">
              <p className="text-xs leading-relaxed text-muted-foreground">
                This link will expire after the selected duration and can only
                be used once. Consuming the link will immediately sign out all
                active sessions for this user.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Link Validity Window
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[15, 30, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setTtlMinutes(mins)}
                      className={`cursor-pointer rounded-xl border p-2 text-xs font-medium transition-all ${
                        ttlMinutes === mins
                          ? "border-primary bg-primary/10 font-semibold text-primary"
                          : "border-border/50 bg-muted/20 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {mins} minutes
                    </button>
                  ))}
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={handleGenerateResetLink}
                  disabled={resetPasswordMutation.isPending}
                  className="w-full cursor-pointer rounded-xl bg-primary font-semibold text-primary-foreground"
                >
                  {resetPasswordMutation.isPending ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      <span>Generating link...</span>
                    </div>
                  ) : (
                    "Generate Reset Link"
                  )}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-xs text-green-500">
                <ClockIcon className="h-4 w-4 shrink-0" />
                <span>Link generated! Valid for {ttlMinutes} minutes.</span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground">
                  Reset URL
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={generatedUrl}
                    className="font-mono text-xs select-all"
                  />
                  <Button
                    onClick={handleCopy}
                    size="sm"
                    className="shrink-0 cursor-pointer gap-1.5 rounded-xl"
                  >
                    {copied ? (
                      <>
                        <CheckIcon className="h-4 w-4 text-green-400" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <CopyIcon className="h-4 w-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setResetModalOpen(false)}
                  className="w-full cursor-pointer rounded-xl"
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
  )
}
export default AdminView
