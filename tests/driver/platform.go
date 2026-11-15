//go:build integration

package driver

import (
	"testing"

	"github.com/masterkeysrd/saturn/apis/saturn"
	messagev1 "github.com/masterkeysrd/saturn/apis/saturn/platform/message/v1"
	schedulerv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/scheduler/v1"
)

// PlatformDriver provides driver actions for platform infrastructure.
type PlatformDriver struct {
	driver *Driver
}

// SchedulerClient returns an authenticated admin client for the scheduler service.
func (p *PlatformDriver) SchedulerClient(tb testing.TB) *schedulerv1.Client {
	adminToken := p.driver.env.getAdminToken(tb)
	return schedulerv1.NewClient(saturn.Config{
		BaseURL:     p.driver.env.ServerURL,
		AccessToken: adminToken,
		HTTPClient:  p.driver.httpClient,
	})
}

// MessageClient returns an authenticated admin client for the message / queue service.
func (p *PlatformDriver) MessageClient(tb testing.TB) *messagev1.Client {
	adminToken := p.driver.env.getAdminToken(tb)
	return messagev1.NewClient(saturn.Config{
		BaseURL:     p.driver.env.ServerURL,
		AccessToken: adminToken,
		HTTPClient:  p.driver.httpClient,
	})
}

// ListSchedules lists all registered scheduler schedules.
func (p *PlatformDriver) ListSchedules(tb testing.TB) (*schedulerv1.ListSchedulesResponse, error) {
	tb.Helper()
	return p.SchedulerClient(tb).ListSchedules(tb.Context(), &schedulerv1.ListSchedulesRequest{})
}

// TriggerSchedule triggers an immediate run of a schedule.
func (p *PlatformDriver) TriggerSchedule(tb testing.TB, scheduleID string) error {
	tb.Helper()
	_, err := p.SchedulerClient(tb).TriggerSchedule(tb.Context(), &schedulerv1.TriggerScheduleRequest{
		Id: scheduleID,
	})
	return err
}

// PauseSchedule pauses an active schedule.
func (p *PlatformDriver) PauseSchedule(tb testing.TB, scheduleID string) error {
	tb.Helper()
	_, err := p.SchedulerClient(tb).PauseSchedule(tb.Context(), &schedulerv1.PauseScheduleRequest{
		Id: scheduleID,
	})
	return err
}

// ResumeSchedule resumes a paused schedule.
func (p *PlatformDriver) ResumeSchedule(tb testing.TB, scheduleID string) error {
	tb.Helper()
	_, err := p.SchedulerClient(tb).ResumeSchedule(tb.Context(), &schedulerv1.ResumeScheduleRequest{
		Id: scheduleID,
	})
	return err
}

// ListJobs lists job execution history.
func (p *PlatformDriver) ListJobs(tb testing.TB, req *schedulerv1.ListJobsRequest) (*schedulerv1.ListJobsResponse, error) {
	tb.Helper()
	return p.SchedulerClient(tb).ListJobs(tb.Context(), req)
}

// GetSchedulerStatus returns scheduler health and status metrics.
func (p *PlatformDriver) GetSchedulerStatus(tb testing.TB) (*schedulerv1.GetSchedulerStatusResponse, error) {
	tb.Helper()
	return p.SchedulerClient(tb).GetSchedulerStatus(tb.Context(), &schedulerv1.GetSchedulerStatusRequest{})
}

// GetQueueMetrics returns EventBus queue delivery metrics.
func (p *PlatformDriver) GetQueueMetrics(tb testing.TB) (*messagev1.GetQueueMetricsResponse, error) {
	tb.Helper()
	return p.MessageClient(tb).GetQueueMetrics(tb.Context(), &messagev1.GetQueueMetricsRequest{})
}

// ListDeliveries lists message deliveries in the queue.
func (p *PlatformDriver) ListDeliveries(tb testing.TB, req *messagev1.ListDeliveriesRequest) (*messagev1.ListDeliveriesResponse, error) {
	tb.Helper()
	return p.MessageClient(tb).ListDeliveries(tb.Context(), req)
}

// PublishEvent publishes a message via the running EventBus engine.
func (p *PlatformDriver) PublishEvent(tb testing.TB, topic string, payload []byte) error {
	tb.Helper()
	eb := p.driver.env.EventBus()
	if eb == nil {
		tb.Fatalf("EventBus is not running in TestEnv")
	}
	return eb.Publish(tb.Context(), topic, payload)
}

// RetryJob resets a failed job's attempt count to retry immediately.
func (p *PlatformDriver) RetryJob(tb testing.TB, jobID string) error {
	tb.Helper()
	_, err := p.SchedulerClient(tb).RetryJob(tb.Context(), &schedulerv1.RetryJobRequest{
		Id: jobID,
	})
	return err
}

// DeleteJob removes a job from the scheduler queue.
func (p *PlatformDriver) DeleteJob(tb testing.TB, jobID string) error {
	tb.Helper()
	_, err := p.SchedulerClient(tb).DeleteJob(tb.Context(), &schedulerv1.DeleteJobRequest{
		Id: jobID,
	})
	return err
}

// RetryDelivery resets a delivery record to retry immediately.
func (p *PlatformDriver) RetryDelivery(tb testing.TB, deliveryID string) error {
	tb.Helper()
	_, err := p.MessageClient(tb).RetryDelivery(tb.Context(), &messagev1.RetryDeliveryRequest{
		Id: deliveryID,
	})
	return err
}
