import { useState, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  SpaceDetailsSchema,
  type SpaceDetailsFormValues,
  AddMemberSchema,
  type AddMemberFormValues,
} from "@saturn/schemas"
import { usePatch } from "@/hooks/use-patch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
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
  useCreateSpaceMemberMutation,
  useDeleteSpaceMemberMutation,
  useUpdateSpaceMemberMutation,
  useUpdateSpaceMutation,
  type Space,
  type SpaceMember_Role,
  type UpdateSpaceRequest,
} from "@saturn/api/gen/saturn/space/v1/space"
import { SPACE_ROLE_OPTIONS } from "@saturn/core"
import { useI18n } from "@saturn/hooks"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { toast } from "@/components/ui/toast"

interface ManageSpaceSheetProps {
  space: Space | null
  onClose: () => void
}

export function ManageSpaceSheet({ space, onClose }: ManageSpaceSheetProps) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const {
    spaceId: activeSpaceId,
    spaceRole: activeSpaceRole,
    switchSpace,
  } = useActiveSpaceContext()

  const [generalError, setGeneralError] = useState("")
  const [memberError, setMemberError] = useState("")

  const addMemberDefaultValues: AddMemberFormValues = useMemo(
    () => ({
      userId: "",
      role: "MEMBER",
    }),
    []
  )

  const addMemberForm = useForm<AddMemberFormValues>({
    resolver: zodResolver(AddMemberSchema),
    defaultValues: addMemberDefaultValues,
    values: addMemberDefaultValues,
    resetOptions: { keepDirtyValues: false },
  })

  // Queries & Mutations
  const spaceId = space?.id ?? ""
  const { data: membersData, isLoading: isMembersLoading } =
    useListSpaceMembersQuery(
      { spaceId, pageSize: 50, pageToken: "" },
      { enabled: !!spaceId }
    )

  const updateSpaceMutation = useUpdateSpaceMutation()
  const createMemberMutation = useCreateSpaceMemberMutation()
  const deleteMemberMutation = useDeleteSpaceMemberMutation()
  const updateMemberMutation = useUpdateSpaceMemberMutation()

  const patchMutation = usePatch<
    Space,
    { space_id: string; req: UpdateSpaceRequest }
  >({
    entityKey: "/api/v1/spaces",
    mutationFn: (vars) => updateSpaceMutation.mutateAsync(vars),
    buildVariables: (id, payload, dirtyPaths, expectedVersion) => ({
      space_id: id,
      req: {
        spaceId: id,
        version: expectedVersion,
        space: payload as Space,
        updateMask: { paths: dirtyPaths },
      },
    }),
  })

  const spaceDefaultValues: SpaceDetailsFormValues = useMemo(
    () => ({
      name: space?.name || "",
      description: space?.description || "",
    }),
    [space?.name, space?.description]
  )

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors, dirtyFields },
  } = useForm<SpaceDetailsFormValues>({
    resolver: zodResolver(SpaceDetailsSchema),
    defaultValues: spaceDefaultValues,
    values: spaceDefaultValues,
    resetOptions: { keepDirtyValues: true },
  })

  if (!space) return null

  const handleUpdateDetails = async (data: SpaceDetailsFormValues) => {
    if (!space?.id) return
    setGeneralError("")
    try {
      const updated = await patchMutation.mutateAsync({
        id: space.id,
        expectedVersion: space.version ? String(space.version) : undefined,
        payload: {
          name: data.name.trim(),
          description: data.description?.trim() || "",
        },
        dirtyFields,
      })
      queryClient.invalidateQueries({ queryKey: ["/api/v1/spaces"] })
      if (space.id === activeSpaceId) {
        switchSpace({
          spaceId: activeSpaceId,
          spaceName: updated?.name || data.name.trim(),
          spaceRole: activeSpaceRole,
        })
      }
      toast.add({
        type: "success",
        title: t("settings.spaces.updateOk"),
        description: t("settings.spaces.updateOkDesc"),
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t("settings.spaces.updateDetailsFailed")
      setGeneralError(message)
      toast.add({
        type: "error",
        title: t("settings.spaces.updateFailedToast"),
        description: message,
      })
    }
  }

  const handleAddMember = async (data: AddMemberFormValues) => {
    setMemberError("")
    try {
      await createMemberMutation.mutateAsync({
        space_id: spaceId,
        req: {
          spaceId,
          member: {
            userId: data.userId.trim(),
            role: data.role,
          },
        },
      })
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/members`],
      })
      addMemberForm.reset()
      toast.add({
        type: "success",
        title: t("settings.spaces.addMemberOk"),
        description: t("settings.spaces.addMemberOkDesc"),
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t("settings.spaces.addMemberFailed")
      setMemberError(message)
      toast.add({
        type: "error",
        title: t("settings.spaces.addMemberFailedToast"),
        description: message,
      })
    }
  }

  const handleRemoveMember = async (userId: string) => {
    setMemberError("")
    try {
      await deleteMemberMutation.mutateAsync({
        space_id: spaceId,
        user_id: userId,
        req: { spaceId, userId },
      })
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/members`],
      })
      toast.add({
        type: "success",
        title: t("settings.spaces.removeMemberOk"),
        description: t("settings.spaces.removeMemberOkDesc"),
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t("settings.spaces.removeMemberFailed")
      setMemberError(message)
      toast.add({
        type: "error",
        title: t("settings.spaces.removeMemberFailedToast"),
        description: message,
      })
    }
  }

  const handleRoleChange = async (userId: string, role: SpaceMember_Role) => {
    setMemberError("")
    try {
      await updateMemberMutation.mutateAsync({
        space_id: spaceId,
        user_id: userId,
        req: {
          spaceId,
          member: {
            userId,
            role,
          },
          updateMask: { paths: ["role"] },
        },
      })
      queryClient.invalidateQueries({
        queryKey: [`/api/v1/spaces/${spaceId}/members`],
      })
      toast.add({
        type: "success",
        title: t("settings.spaces.roleOk"),
        description: t("settings.spaces.roleOkDesc"),
      })
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t("settings.spaces.roleFailedDefault")
      setMemberError(message)
      toast.add({
        type: "error",
        title: t("settings.spaces.updateRoleFailedToast"),
        description: message,
      })
    }
  }

  const members = membersData?.members ?? []
  const roleLabels: Record<string, string> = {
    OWNER: t("settings.spaces.roleOwner"),
    ADMIN: t("settings.spaces.roleAdmin"),
    MEMBER: t("settings.spaces.roleMember"),
    VIEWER: t("settings.spaces.roleViewer"),
  }

  return (
    <Dialog open={!!space} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[min(88svh,46rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {/* Header Section */}
        <DialogHeader className="shrink-0 space-y-2 border-b border-border/60 px-6 py-4 select-none">
          <div className="flex items-center gap-3 pr-8">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="flex flex-col text-left">
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                {t("settings.spaces.manageTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t("settings.spaces.manageDesc")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Section 1: General settings */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 select-none">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-xs leading-none font-semibold tracking-wider text-muted-foreground uppercase">
                {t("settings.spaces.generalSettings")}
              </h3>
            </div>
            <form
              onSubmit={handleSubmit(handleUpdateDetails)}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label
                  htmlFor="manage-space-name"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t("settings.spaces.spaceName")}
                </Label>
                <Input
                  id="manage-space-name"
                  {...register("name")}
                  className="rounded-xl border-border/40 bg-muted/10 focus:ring-2 focus:ring-primary/20"
                />
                {formErrors.name && (
                  <p className="text-xs text-destructive">
                    {formErrors.name.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="manage-space-desc"
                  className="text-xs font-medium text-muted-foreground"
                >
                  {t("settings.spaces.description")}
                </Label>
                <Input
                  id="manage-space-desc"
                  {...register("description")}
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
                disabled={patchMutation.isPending}
                className="w-full rounded-xl bg-primary text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] shadow-sm transition-colors hover:bg-primary/90"
              >
                {patchMutation.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                {t("settings.spaces.saveSettings")}
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
                  {t("settings.spaces.membersAccess")}
                </h3>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {members.length === 1
                  ? t("settings.spaces.memberCountOne", {
                      count: members.length,
                    })
                  : t("settings.spaces.memberCountOther", {
                      count: members.length,
                    })}
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
              <div className="max-h-64 divide-y divide-border/40 overflow-y-auto border-t border-border/40 select-none">
                {members.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    {t("settings.spaces.noMembers")}
                  </p>
                ) : (
                  members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between gap-2 p-3.5 transition-colors hover:bg-muted/10"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
                          {member.profile?.avatarUrl ? (
                            <img
                              src={member.profile.avatarUrl}
                              alt=""
                              referrerPolicy="no-referrer"
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
                            {roleLabels[member.role] || member.role}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {member.role === "OWNER" ? (
                          <div className="flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary uppercase select-none">
                            <ShieldCheck className="h-3 w-3" />
                            {t("settings.spaces.roleOwner")}
                          </div>
                        ) : (
                          <>
                            <Select
                              value={member.role}
                              onValueChange={(val) =>
                                val &&
                                member.userId &&
                                handleRoleChange(
                                  member.userId,
                                  val as SpaceMember_Role
                                )
                              }
                            >
                              <SelectTrigger className="!h-7 w-24 rounded-lg border-border/40 bg-background px-2.5 py-1 text-[11px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                                {SPACE_ROLE_OPTIONS.map((opt) => (
                                  <SelectItem key={opt.value} value={opt.value}>
                                    {roleLabels[opt.value] || opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                member.userId &&
                                handleRemoveMember(member.userId)
                              }
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
            <form
              onSubmit={addMemberForm.handleSubmit(handleAddMember)}
              className="space-y-3 pt-3"
            >
              <Label className="text-xs font-semibold text-muted-foreground select-none">
                {t("settings.spaces.addMemberBtn")}
              </Label>
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <Input
                    placeholder={t("settings.spaces.addMemberPlaceholder")}
                    {...addMemberForm.register("userId")}
                    className="h-9 flex-1 rounded-xl border-border/40 bg-muted/10 text-xs focus:ring-2 focus:ring-primary/20"
                  />
                  <Controller
                    control={addMemberForm.control}
                    name="role"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(val) => val && field.onChange(val)}
                      >
                        <SelectTrigger className="!h-9 w-28 rounded-xl border-border/40 bg-background px-3 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
                          {SPACE_ROLE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {roleLabels[opt.value] || opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    className="h-9 shrink-0 rounded-xl px-3 transition-all hover:border-transparent hover:bg-primary hover:text-primary-foreground"
                    disabled={createMemberMutation.isPending}
                  >
                    {createMemberMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {addMemberForm.formState.errors.userId && (
                  <p className="text-xs text-destructive">
                    {addMemberForm.formState.errors.userId.message}
                  </p>
                )}
              </div>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
