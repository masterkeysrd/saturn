import { useState } from "react"
import {
  useListDevicesQuery,
  useRevokeDeviceMutation,
  type Device,
} from "@saturn/api/gen/saturn/identity/v1/identity"
import {
  SmartphoneIcon,
  RefreshCwIcon,
  Trash2Icon,
  ShieldCheckIcon,
  ClockIcon,
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
        err instanceof Error ? err.message : "Failed to revoke trusted device"
      )
    }
  }

  const formatDate = (ts?: { seconds?: number } | string | null) => {
    if (!ts) return "Never"
    const secs =
      typeof ts === "object" && ts !== null && "seconds" in ts
        ? Number(ts.seconds)
        : typeof ts === "string"
          ? Math.floor(new Date(ts).getTime() / 1000)
          : 0
    if (!secs) return "Never"
    return new Date(secs * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  const devices = data?.devices || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 pb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Trusted Biometric Devices
          </h2>
          <p className="text-sm text-muted-foreground">
            Mobile devices with hardware security keys (Secure Enclave /
            StrongBox) authorized for passwordless biometric unlock.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => refetch()}
          disabled={isLoading}
          className="h-9 w-9 cursor-pointer"
        >
          <RefreshCwIcon
            className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-36 items-center justify-center rounded-xl border border-border/50 bg-card/60">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCwIcon className="h-4 w-4 animate-spin text-primary" />
            Loading trusted devices...
          </div>
        </div>
      ) : devices.length === 0 ? (
        <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-border/50 bg-card/60 p-6 text-center select-none">
          <SmartphoneIcon className="mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-foreground">
            No trusted devices enrolled
          </p>
          <p className="text-xs text-muted-foreground">
            You can enroll your mobile device using Face ID or Touch ID from the
            Saturn mobile app.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {devices.map((dev) => (
            <div
              key={dev.id}
              className="flex flex-col justify-between rounded-xl border border-border/50 bg-card/60 p-4 transition-colors hover:border-border"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                      <SmartphoneIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">
                        {dev.deviceName || "Mobile Device"}
                      </h4>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-green-500">
                          <ShieldCheckIcon className="h-3 w-3" />
                          {dev.algorithm || "ES256"} Hardware Key
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setDeviceToRevoke(dev)
                      setRevokeError(null)
                      setRevokeOpen(true)
                    }}
                    className="h-8 w-8 cursor-pointer text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2Icon className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-1 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>Enrolled</span>
                    <span className="font-medium text-foreground">
                      {formatDate(dev.createTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Last Active</span>
                    <span className="font-medium text-foreground">
                      {formatDate(dev.lastUsedTime)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/40 pt-1 text-[11px]">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <ClockIcon className="h-3 w-3" /> Expiration
                    </span>
                    <span className="text-muted-foreground">
                      {formatDate(dev.expireTime)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revocation Confirmation Dialog */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangleIcon className="h-5 w-5" />
              <DialogTitle>Revoke Trusted Device?</DialogTitle>
            </div>
            <DialogDescription>
              Are you sure you want to revoke{" "}
              <strong className="text-foreground">
                {deviceToRevoke?.deviceName}
              </strong>
              ? This device will immediately lose biometric unlock access, and
              all active sessions originated from it will be terminated.
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
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeConfirm}
              disabled={revokeMutation.isPending}
              className="cursor-pointer"
            >
              {revokeMutation.isPending ? "Revoking..." : "Revoke Device"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
