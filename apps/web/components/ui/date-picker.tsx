import { format, isValid } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

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
  placeholder = "Pick a date",
  className,
}: DatePickerProps) {
  const isValidDate = date instanceof Date && isValid(date)

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
        {isValidDate ? (
          <span className="font-mono tabular-nums">
            {format(date, "yyyy/MM/dd")}
          </span>
        ) : (
          <span>{placeholder}</span>
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
