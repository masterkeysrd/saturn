import type { ComponentType } from "react"
import type { DashboardWidgetId } from "@saturn/core"
import { AiQuickAskWidget } from "./ai-quick-ask-widget"
import { NetWorthWidget } from "./net-worth-widget"
import { BudgetPaceWidget } from "./budget-pace-widget"
import { UpcomingBillsWidget } from "./upcoming-bills-widget"
import { TodayScheduleWidget } from "./today-schedule-widget"
import { PriorityMailWidget } from "./priority-mail-widget"
import { WorkflowRunsWidget } from "./workflow-runs-widget"

export const DASHBOARD_WIDGET_COMPONENTS: Record<
  DashboardWidgetId,
  ComponentType
> = {
  ai_quick_ask: AiQuickAskWidget,
  net_worth: NetWorthWidget,
  budget_pace: BudgetPaceWidget,
  upcoming_bills: UpcomingBillsWidget,
  today_schedule: TodayScheduleWidget,
  priority_mail: PriorityMailWidget,
  workflow_runs: WorkflowRunsWidget,
}

export {
  AiQuickAskWidget,
  NetWorthWidget,
  BudgetPaceWidget,
  UpcomingBillsWidget,
  TodayScheduleWidget,
  PriorityMailWidget,
  WorkflowRunsWidget,
}
