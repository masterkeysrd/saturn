import { useState } from "react"
import { ArrowRight, Layers, Loader2 } from "lucide-react"
import { useCreateSpaceMutation } from "@/gen/saturn/space/v1/space"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function NoSpaceActiveScreen() {
  const [name, setName] = useState("")
  const [desc, setDesc] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const createMutation = useCreateSpaceMutation()
  const { switchSpace } = useActiveSpaceContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsCreating(true)
    try {
      const space = await createMutation.mutateAsync({
        name: name.trim(),
        description: desc.trim(),
      })
      queryClient.invalidateQueries({ queryKey: ["/api/v1/spaces"] })
      switchSpace({
        spaceId: space.id || "",
        spaceName: space.name,
        spaceRole: "owner",
      })
      navigate(`/space/${space.id}/finance`)
    } catch (err) {
      console.error(err)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="mx-auto flex h-svh w-full max-w-md flex-1 animate-in flex-col items-center justify-center px-4 py-20 text-center duration-500 select-none zoom-in-95 fade-in">
      <div className="w-full space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border border-border/40 bg-muted/40 text-muted-foreground shadow-sm">
          <Layers className="h-10 w-10 animate-pulse text-primary" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Create a Workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            Saturn organizes your budgets, transactions, and documents into
            isolated spaces. Create your first workspace to get started.
          </p>
        </div>

        <form onSubmit={handleCreateSpace} className="space-y-4 pt-2 text-left">
          <div className="space-y-1.5">
            <Label
              htmlFor="spaceName"
              className="text-xs font-semibold text-muted-foreground uppercase"
            >
              Workspace Name
            </Label>
            <Input
              id="spaceName"
              placeholder="e.g. Personal, Business"
              className="h-10 w-full rounded-xl border-border/60 bg-background/40"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isCreating}
            />
          </div>
          <div className="space-y-1.5">
            <Label
              htmlFor="spaceDesc"
              className="text-xs font-semibold text-muted-foreground uppercase"
            >
              Description (Optional)
            </Label>
            <Input
              id="spaceDesc"
              placeholder="e.g. My daily expenses and savings"
              className="h-10 w-full rounded-xl border-border/60 bg-background/40"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              disabled={isCreating}
            />
          </div>
          <Button
            type="submit"
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent font-semibold text-white shadow-lg shadow-primary/15 transition-all hover:opacity-95"
            disabled={isCreating || !name.trim()}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Create Workspace
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
