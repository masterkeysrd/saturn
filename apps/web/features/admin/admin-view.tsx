import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useListUsersQuery,
  useApproveUserMutation,
  useRejectUserMutation,
  type ListUsersRequest_StatusFilter,
} from "@/gen/saturn/identity/admin/v1/admin_identity"
import { Button } from "@/components/ui/button"
import {
  BadgeCheckIcon,
  XCircleIcon,
  ShieldAlertIcon,
  RefreshCwIcon,
  UserIcon,
} from "lucide-react"
import { PageLayout } from "@/components/ui/page-layout"

export function AdminView() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] =
    useState<ListUsersRequest_StatusFilter>("PENDING_APPROVAL")
  const [searchQuery, setSearchQuery] = useState("")

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
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${
                            account.status === "active"
                              ? "border-green-500/20 bg-green-500/10 text-green-400"
                              : account.status === "pending_approval"
                                ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
                                : "border-destructive/20 bg-destructive/10 text-destructive"
                          }`}
                        >
                          {account.status.replace("_", " ")}
                        </span>
                      </td>

                      {/* Actions Column */}
                      <td className="px-6 py-4.5 text-right">
                        {isPending ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              onClick={() => handleReject(account.id)}
                              disabled={isPendingOperation}
                              variant="ghost"
                              size="sm"
                              className="h-8 cursor-pointer rounded-xl px-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <XCircleIcon className="mr-1.5 h-4 w-4" />
                              Deny
                            </Button>
                            <Button
                              onClick={() => handleApprove(account.id)}
                              disabled={isPendingOperation}
                              className="h-8 cursor-pointer rounded-xl bg-green-600 px-3.5 text-white shadow-sm shadow-green-600/10 hover:bg-green-700"
                            >
                              <BadgeCheckIcon className="mr-1.5 h-4 w-4" />
                              Approve
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
    </PageLayout>
  )
}
export default AdminView
