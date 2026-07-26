import { format, isValid } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
        render={
          <Button
            variant="outline"
            className={cn(
              "h-12 w-full justify-start rounded-xl border border-border/60 bg-background/50 text-left font-normal",
              !isValidDate && "text-muted-foreground",
              className
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
            {isValidDate ? (
              format(date, "yyyy/MM/dd")
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        }
      />
      <PopoverContent className="w-auto rounded-2xl border border-border/50 bg-card/90 p-0 shadow-2xl backdrop-blur-xl">
        <Calendar
          mode="single"
          selected={isValidDate ? date : undefined}
          onSelect={setDate}
        />
      </PopoverContent>
    </Popover>
  )
}
