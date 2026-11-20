import { useState } from "react"
import { useI18n, useTimezone } from "@saturn/hooks"
import {
  useListDevicesQuery,
  useRevokeDeviceMutation,
  type Device,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  FingerprintIcon,
  SmartphoneIcon,
  RefreshCwIcon,
  Trash2Icon,
  ShieldCheckIcon,
  AlertTriangleIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"

export function TrustedDevicesSettings() {
  const { t } = useI18n()
  const tz = useTimezone()
  const { data, isLoading, refetch } = useListDevicesQuery({})
  const revokeMutation = useRevokeDeviceMutation()

  const [deviceToRevoke, setDeviceToRevoke] = useState<Device | null>(null)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const handleRevokeConfirm = async () => {
    if (!deviceToRevoke?.id) return
    setRevokeError(null)

    try {
      await revokeMutation.mutateAsync({
        device_id: deviceToRevoke.id,
        req: { deviceId: deviceToRevoke.id },
      })
      setRevokeOpen(false)
      setDeviceToRevoke(null)
      refetch()
    } catch (err: unknown) {
      setRevokeError(
        err instanceof Error
          ? err.message
          : t("settings.devices.revokeFailedDefault")
      )
    }
  }

  const formatDate = (ts?: { seconds?: number } | string | null) => {
    if (!ts) return t("settings.devices.never")
    const secs =
      typeof ts === "object" && "seconds" in ts
        ? Number(ts.seconds)
        : typeof ts === "string"
          ? Math.floor(new Date(ts).getTime() / 1000)
          : 0
    if (!secs) return t("settings.devices.never")
    return tz.formatDateTime(new Date(secs * 1000))
  }

  const devices = data?.devices || []

  return (
    <div className="rounded-2xl border border-border/50 bg-card/60 p-6 shadow-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
            <FingerprintIcon className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-foreground">
                {t("settings.devices.title")}
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {devices.length} {t("settings.devices.enrolledBadge")}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.devices.desc")}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isLoading}
          className="h-8 w-8 cursor-pointer self-start sm:self-center"
        >
          <RefreshCwIcon
            className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Devices List */}
      <div>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCwIcon className="h-4 w-4 animate-spin text-primary" />
              {t("settings.devices.loading")}
            </div>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center p-6 text-center select-none">
            <FingerprintIcon className="mb-2 h-7 w-7 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              {t("settings.devices.emptyTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings.devices.emptyDesc")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {devices.map((dev) => (
              <div
                key={dev.id}
                className="flex flex-col gap-3 py-3.5 transition-colors first:pt-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3.5 text-left">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                    <SmartphoneIcon className="h-4.5 w-4.5 text-foreground" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {dev.deviceName || t("settings.devices.mobileDevice")}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 font-mono text-[10px] text-green-600 dark:text-green-400">
                        <ShieldCheckIcon className="h-3 w-3" />
                        {dev.algorithm || "ES256"}{" "}
                        {t("settings.devices.keySuffix")}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
                      <span>
                        {t("settings.devices.enrolledOn", {
                          date: formatDate(dev.createTime),
                        })}
                      </span>
                      <span>•</span>
                      <span>
                        {t("settings.devices.lastActiveOn", {
                          date: formatDate(dev.lastUsedTime),
                        })}
                      </span>
                      <span>•</span>
                      <span>
                        {t("settings.devices.expiresOn", {
                          date: formatDate(dev.expireTime),
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center self-end sm:self-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDeviceToRevoke(dev)
                      setRevokeError(null)
                      setRevokeOpen(true)
                    }}
                    className="h-8 cursor-pointer text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2Icon className="mr-1.5 h-3.5 w-3.5" />
                    {t("settings.devices.revoke")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Revocation Confirmation Dialog */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent mobileFullscreen={false} className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangleIcon className="h-5 w-5" />
              <DialogTitle>
                {t("settings.devices.revokeConfirmTitle")}
              </DialogTitle>
            </div>
            <DialogDescription>
              {t("settings.devices.revokeConfirmDesc", {
                name: deviceToRevoke?.deviceName ?? "",
              })}
            </DialogDescription>
          </DialogHeader>

          {revokeError && (
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              {revokeError}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeOpen(false)}
              className="cursor-pointer"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeConfirm}
              disabled={revokeMutation.isPending}
              className="cursor-pointer"
            >
              {revokeMutation.isPending
                ? t("settings.devices.revoking")
                : t("settings.devices.revokeDevice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
