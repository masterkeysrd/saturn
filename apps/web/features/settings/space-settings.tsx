import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useQueryClient } from "@tanstack/react-query"
import { useMySpaces, useActiveSpaceContext } from "@/features/space/use-space"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Loader2, Plus, Trash2 } from "lucide-react"
import {
  useCreateSpaceMutation,
  useDeleteSpaceMutation,
  type CreateSpaceRequest,
  type Space,
} from "@/gen/saturn/space/v1/space"
import { ManageSpaceSheet } from "./manage-space-sheet"

export function SpaceSettings() {
  const { spaces, isLoading: isSpacesLoading } = useMySpaces()
  const { spaceId, spaceName, switchSpace, clearActiveSpace } =
    useActiveSpaceContext()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()

  // Create Space state
  const [createOpen, setCreateOpen] = useState(
    () => searchParams.get("create") === "true"
  )
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [managingSpace, setManagingSpace] = useState<Space | null>(null)
  const [newName, setNewName] = useState("")
  const [newDesc, setNewDesc] = useState("")

  const createMutation = useCreateSpaceMutation()
  const deleteMutation = useDeleteSpaceMutation()

  const handleCreate = async () => {
    if (!newName.trim()) return
    const req: CreateSpaceRequest = {
      name: newName.trim(),
      description: newDesc.trim(),
    }
    try {
      const space = await createMutation.mutateAsync(req)
      console.log(`Space "${space.name}" created`)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/spaces"] })
      setCreateOpen(false)
      setNewName("")
      setNewDesc("")
      switchSpace({
        spaceId: space.id,
        spaceName: space.name,
        spaceRole: "owner",
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error"
      console.error("Failed to create space:", message)
    }
  }

  const handleDelete = async (targetId: string) => {
    try {
      await deleteMutation.mutateAsync({
        space_id: targetId,
        req: { spaceId: targetId },
      })
      console.log("Space deleted")
      queryClient.invalidateQueries({ queryKey: ["/api/v1/spaces"] })
      if (targetId === spaceId) {
        clearActiveSpace()
      }
      setDeleteTarget(null)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error"
      console.error("Failed to delete space:", message)
    }
  }

  return (
    <div className="space-y-6">
      {/* Active Space Info */}
      <div className="rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm dark:bg-card/45">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Active Space</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {spaceName || "No active space"}
            </p>
          </div>
          {spaceId && (
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Open Space
            </Button>
          )}
        </div>
      </div>

      {/* Create Space Trigger card */}
      <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-card/60 p-5 shadow-sm dark:bg-card/45">
        <div>
          <h3 className="text-sm font-semibold">Create New Space</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a workspace to organize your projects.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create
        </Button>
      </div>

      {/* Spaces List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">
          Your Spaces ({spaces.length})
        </h3>
        {isSpacesLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : spaces.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No spaces yet. Create one to get started.
          </p>
        ) : (
          <div className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/40 bg-muted/20 select-none">
            {spaces.map((space) => (
              <div
                key={space.id}
                className={`flex items-center justify-between p-4 transition-colors ${
                  space.id === spaceId ? "bg-accent/15" : "hover:bg-muted/10"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                    {space.name?.[0]?.toUpperCase() ?? "S"}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-semibold text-foreground">
                      {space.name}
                    </span>
                    {space.description && (
                      <span className="line-clamp-1 text-xs text-muted-foreground">
                        {space.description}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      space.id === spaceId
                        ? "bg-green-500/10 text-green-600 dark:bg-green-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {space.id === spaceId ? "Active" : "Inactive"}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {space.id !== spaceId && (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          switchSpace({
                            spaceId: space.id,
                            spaceName: space.name,
                            spaceRole: "owner",
                          })
                        }
                      >
                        Activate
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setManagingSpace(space)}
                    >
                      Manage
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setDeleteTarget(space.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open)
          if (!open && searchParams.get("create") === "true") {
            setSearchParams({ tab: "spaces" }, { replace: true })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a New Space</DialogTitle>
            <DialogDescription>
              Create a workspace to organize your projects and isolate your
              productivity data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="space-name">Space Name</Label>
              <Input
                id="space-name"
                placeholder="My Workspace"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="space-desc">Description</Label>
              <Input
                id="space-desc"
                placeholder="A description of your workspace"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || createMutation.isPending}
            >
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Space</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this space? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManageSpaceSheet
        space={managingSpace}
        onClose={() => setManagingSpace(null)}
      />
    </div>
  )
}
