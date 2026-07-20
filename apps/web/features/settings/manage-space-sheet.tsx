import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  Users,
  Settings2,
  AlertCircle,
} from "lucide-react"
import {
  useListSpaceMembersQuery,
  useAddSpaceMemberMutation,
  useRemoveSpaceMemberMutation,
  useUpdateSpaceMemberRoleMutation,
  useUpdateSpaceMutation,
  type Space,
} from "@/gen/saturn/space/v1/space"

interface ManageSpaceSheetProps {
  space: Space | null
  onClose: () => void
}

export function ManageSpaceSheet({ space, onClose }: ManageSpaceSheetProps) {
  const queryClient = useQueryClient()

  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [newUserId, setNewUserId] = useState("")
  const [newRole, setNewRole] = useState("member")
  const [generalError, setGeneralError] = useState("")
  const [memberError, setMemberError] = useState("")
  const [prevSpaceId, setPrevSpaceId] = useState<string | null>(null)

  if (space && space.id !== prevSpaceId) {
    setPrevSpaceId(space.id)
    setName(space.name)
    setDescription(space.description || "")
    setGeneralError("")
    setMemberError("")
  }

  // Queries & Mutations
  const spaceId = space?.id ?? ""
  const { data: membersData, isLoading: isMembersLoading } =
    useListSpaceMembersQuery(
      { spaceId, pageSize: 50, nextPageToken: "" },
      { enabled: !!spaceId }
    )

  const updateSpaceMutation = useUpdateSpaceMutation()
  const addMemberMutation = useAddSpaceMemberMutation()
  const removeMemberMutation = useRemoveSpaceMemberMutation()
  const updateRoleMutation = useUpdateSpaceMemberRoleMutation()

  if (!space) return null

  const handleUpdateDetails = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setGeneralError("")
    try {
      await updateSpaceMutation.mutateAsync({
        space_id: spaceId,
        req: { spaceId, name: name.trim(), description: description.trim() },
      })
      queryClient.invalidateQueries({ queryKey: ["/api/v1/spaces"] })
    } catch (err: unknown) {
      setGeneralError(
        err instanceof Error ? err.message : "Failed to update details"
      )
    }
  }

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserId.trim()) return
    setMemberError("")
    try {
      await addMemberMutation.mutateAsync({
        space_id: spaceId,
        req: { spaceId, userId: newUserId.trim(), role: newRole },
      })
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/members`],
      })
      setNewUserId("")
    } catch (err: unknown) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to add member"
      )
    }
  }

  const handleRemoveMember = async (userId: string) => {
    setMemberError("")
    try {
      await removeMemberMutation.mutateAsync({
        space_id: spaceId,
        user_id: userId,
        req: { spaceId, userId },
      })
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/members`],
      })
    } catch (err: unknown) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to remove member"
      )
    }
  }

  const handleRoleChange = async (userId: string, role: string) => {
    setMemberError("")
    try {
      await updateRoleMutation.mutateAsync({
        space_id: spaceId,
        user_id: userId,
        req: { spaceId, userId, role },
      })
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/members`],
      })
    } catch (err: unknown) {
      setMemberError(
        err instanceof Error ? err.message : "Failed to update role"
      )
    }
  }

  const members = membersData?.members ?? []

  return (
    <Sheet open={!!space} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] overflow-y-auto border-l border-border/40 bg-background/95 p-0 shadow-2xl backdrop-blur-xl sm:max-w-lg">
        {/* Header Section */}
        <SheetHeader className="space-y-2 border-b border-border/40 p-6 select-none">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary to-accent text-white shadow-lg shadow-primary/20">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="flex flex-col text-left">
              <SheetTitle className="text-lg font-bold tracking-tight text-foreground">
                Manage Space
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Settings and access control for this workspace.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 p-6">
          {/* Section 1: General settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 select-none">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                General Settings
              </h3>
            </div>
            <form onSubmit={handleUpdateDetails} className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="manage-space-name"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Space Name
                </Label>
                <Input
                  id="manage-space-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded-xl border-border/40 bg-muted/10 focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="manage-space-desc"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Description
                </Label>
                <Input
                  id="manage-space-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="rounded-xl border-border/40 bg-muted/10 focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {generalError && (
                <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{generalError}</span>
                </div>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim() || updateSpaceMutation.isPending}
                className="w-full rounded-xl bg-gradient-to-r from-primary to-accent text-white shadow-md shadow-primary/10 transition-opacity hover:opacity-95"
              >
                {updateSpaceMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Save Settings
              </Button>
            </form>
          </div>

          <hr className="border-border/40" />

          {/* Section 2: Members management */}
          <div className="space-y-4">
            <div className="flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-xs leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                  Members Access
                </h3>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {members.length} Member{members.length !== 1 ? "s" : ""}
              </span>
            </div>

            {memberError && (
              <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{memberError}</span>
              </div>
            )}

            {isMembersLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="max-h-64 space-y-2 divide-y divide-border/40 overflow-y-auto rounded-2xl border border-border/40 bg-muted/20 select-none">
                {members.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No members found.
                  </p>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between gap-2 p-3.5 transition-colors hover:bg-muted/10"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-tr from-primary/10 to-accent/10 text-xs font-bold text-primary">
                          {member.profile?.avatarUrl ? (
                            <img
                              src={member.profile.avatarUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            (member.profile?.name ||
                              member.userId ||
                              "U")[0].toUpperCase()
                          )}
                        </div>
                        <div className="flex min-w-0 flex-col text-left">
                          <span className="max-w-[220px] truncate text-xs font-semibold text-foreground/90">
                            {member.profile?.name || member.userId}
                          </span>
                          <span className="text-[10px] leading-none text-muted-foreground">
                            {member.profile?.username
                              ? `@${member.profile.username} • `
                              : ""}
                            {member.role}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {member.role === "owner" ? (
                          <div className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase select-none">
                            <ShieldCheck className="h-3 w-3" />
                            Owner
                          </div>
                        ) : (
                          <>
                            <select
                              value={member.role}
                              onChange={(e) =>
                                handleRoleChange(member.userId, e.target.value)
                              }
                              className="cursor-pointer rounded-lg border border-border/40 bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-all outline-none focus:border-primary/50"
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                            </select>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleRemoveMember(member.userId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Add Member sub-form */}
            <form onSubmit={handleAddMember} className="space-y-3 pt-3">
              <Label className="text-xs font-semibold text-muted-foreground select-none">
                Add Workspace Member
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter User ID (usr_...)"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  className="h-9 flex-1 rounded-xl border-border/40 bg-muted/10 text-xs focus:ring-2 focus:ring-primary/20"
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="h-9 cursor-pointer rounded-xl border border-border/40 bg-background px-3 text-xs font-medium text-muted-foreground outline-none focus:border-primary/50"
                >
                  <option value="admin">Admin</option>
                  <option value="member">Member</option>
                </select>
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="h-9 shrink-0 rounded-xl px-3 transition-all hover:border-transparent hover:bg-primary hover:text-white"
                  disabled={!newUserId.trim() || addMemberMutation.isPending}
                >
                  {addMemberMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
