import { useState } from "react"
import { ArrowRight, Layers, Loader2 } from "lucide-react"
import { useCreateSpaceMutation } from "@saturn/api/gen/saturn/space/v1/space"
import { useI18n } from "@saturn/hooks"
import { useActiveSpaceContext } from "@/features/space/use-space"
import { useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"

export function NoSpaceActiveScreen() {
  const { t } = useI18n()
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
      toast.add({
        type: "success",
        title: t("settings.spaces.createOk"),
        description: t("settings.spaces.createOkDesc", {
          name: space.name ?? "",
        }),
      })
      navigate(`/space/${space.id}/finance`)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("settings.spaces.createFailedDefault")
      console.error(err)
      toast.add({
        type: "error",
        title: t("settings.spaces.createFailedToast"),
        description: message,
      })
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
            {t("space.createTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("space.createDesc")}
          </p>
        </div>

        <form onSubmit={handleCreateSpace} className="space-y-4 pt-2 text-left">
          <div className="space-y-1.5">
            <Label
              htmlFor="spaceName"
              className="text-xs font-semibold text-muted-foreground uppercase"
            >
              {t("settings.spaces.mobile.workspaceName")}
            </Label>
            <Input
              id="spaceName"
              placeholder={t("settings.spaces.mobile.nameExample")}
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
              {t("settings.spaces.mobile.descriptionOptional")}
            </Label>
            <Input
              id="spaceDesc"
              placeholder={t("settings.spaces.mobile.descExample")}
              className="h-10 w-full rounded-xl border-border/60 bg-background/40"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              disabled={isCreating}
            />
          </div>
          <Button
            type="submit"
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground shadow-[inset_0_1px_0_oklch(1_0_0/0.16)] shadow-sm transition-colors hover:bg-primary/90"
            disabled={isCreating || !name.trim()}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {t("space.createCta")}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
