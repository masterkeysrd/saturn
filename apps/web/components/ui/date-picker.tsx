import { Calendar as CalendarIcon } from "lucide-react"
import { formatDateWithTimezone } from "@saturn/core"
import { useI18n, useTimezone } from "@saturn/hooks"

import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerProps {
  date?: Date
  setDate: (date?: Date) => void
  placeholder?: string
  className?: string
}

export function DatePicker({
  date,
  setDate,
  placeholder,
  className,
}: DatePickerProps) {
  const tz = useTimezone()
  const { t } = useI18n()
  const resolvedPlaceholder = placeholder ?? t("datePicker.pickDate")
  const isValidDate = date instanceof Date && !Number.isNaN(date.getTime())

  const formattedDate = isValidDate
    ? formatDateWithTimezone(
        new Date(
          Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            12,
            0,
            0
          )
        ),
        "UTC",
        {
          year: "numeric",
          month: "short",
          day: "numeric",
        },
        tz.locale
      )
    : null

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          "flex h-10 w-full cursor-pointer items-center justify-start gap-2 rounded-lg border border-border bg-control px-3 text-left text-sm font-normal text-foreground shadow-2xs transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
          !isValidDate && "text-muted-foreground",
          className
        )}
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        {formattedDate ? (
          <span className="font-mono tabular-nums">{formattedDate}</span>
        ) : (
          <span>{resolvedPlaceholder}</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-xl border border-border bg-popover p-0 shadow-xl">
        <Calendar
          mode="single"
          selected={isValidDate ? date : undefined}
          onSelect={setDate}
        />
      </PopoverContent>
    </Popover>
  )
}
