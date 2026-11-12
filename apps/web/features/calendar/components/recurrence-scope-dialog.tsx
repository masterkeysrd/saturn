import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { RecurrenceScope } from "@saturn/api/saturn/calendar/v1/calendar"

export interface RecurrenceScopeDialogProps {
  open: boolean
  action: "edit" | "delete"
  onClose: () => void
  onConfirm: (scope: RecurrenceScope) => void
}

export function RecurrenceScopeDialog({
  open,
  action,
  onClose,
  onConfirm,
}: RecurrenceScopeDialogProps) {
  const [selectedScope, setSelectedScope] = useState<RecurrenceScope>(
    "RECURRENCE_SCOPE_THIS_EVENT"
  )

  const isDelete = action === "delete"

  const handleConfirm = () => {
    onConfirm(selectedScope)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isDelete ? "Delete Recurring Event" : "Edit Recurring Event"}
          </DialogTitle>
          <DialogDescription>
            This event is part of a recurring series. How would you like to
            apply your {isDelete ? "deletion" : "changes"}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-3">
          <label
            data-testid="scope-this-event"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition hover:bg-muted/50"
          >
            <input
              type="radio"
              name="recurrenceScope"
              value="RECURRENCE_SCOPE_THIS_EVENT"
              checked={selectedScope === "RECURRENCE_SCOPE_THIS_EVENT"}
              onChange={() => setSelectedScope("RECURRENCE_SCOPE_THIS_EVENT")}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium">This event only</div>
              <div className="text-xs text-muted-foreground">
                Only this instance will be modified. Other occurrences remain
                unchanged.
              </div>
            </div>
          </label>

          <label
            data-testid="scope-this-and-following"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition hover:bg-muted/50"
          >
            <input
              type="radio"
              name="recurrenceScope"
              value="RECURRENCE_SCOPE_THIS_AND_FOLLOWING"
              checked={selectedScope === "RECURRENCE_SCOPE_THIS_AND_FOLLOWING"}
              onChange={() =>
                setSelectedScope("RECURRENCE_SCOPE_THIS_AND_FOLLOWING")
              }
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium">
                This and following events
              </div>
              <div className="text-xs text-muted-foreground">
                Applies to this occurrence and all future occurrences in the
                series.
              </div>
            </div>
          </label>

          <label
            data-testid="scope-all-events"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition hover:bg-muted/50"
          >
            <input
              type="radio"
              name="recurrenceScope"
              value="RECURRENCE_SCOPE_ALL_EVENTS"
              checked={selectedScope === "RECURRENCE_SCOPE_ALL_EVENTS"}
              onChange={() => setSelectedScope("RECURRENCE_SCOPE_ALL_EVENTS")}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium">All events</div>
              <div className="text-xs text-muted-foreground">
                Applies to all past and future occurrences in this recurring
                series.
              </div>
            </div>
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid="confirm-scope-btn"
            variant={isDelete ? "destructive" : "default"}
            onClick={handleConfirm}
          >
            {isDelete ? "Delete" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
