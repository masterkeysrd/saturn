package scheduler

import (
	"context"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	schedulerv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/scheduler/v1"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// Handler implements the schedulerv1.SchedulerAdminServer interface.
type Handler struct {
	schedulerv1.UnimplementedSchedulerAdminServer
	Engine *scheduler.Engine
}

// NewHandler instantiates a new admin gRPC handler.
func NewHandler(engine *scheduler.Engine) *Handler {
	return &Handler{Engine: engine}
}

// ListSchedules lists all recurring schedules currently defined in the system.
func (h *Handler) ListSchedules(ctx context.Context, req *schedulerv1.ListSchedulesRequest) (*schedulerv1.ListSchedulesResponse, error) {
	schedules, err := h.Engine.ListSchedules(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list schedules: %v", err)
	}

	protoSchedules := make([]*schedulerv1.ScheduleInfo, len(schedules))
	for i, s := range schedules {
		protoSchedules[i] = &schedulerv1.ScheduleInfo{
			Id:             s.ID,
			JobType:        s.JobType,
			Payload:        s.Payload,
			CronExpression: s.CronExpression,
			NextRunAt:      timestamppb.New(s.NextRunAt),
			Status:         s.Status,
			CreateTime:     timestamppb.New(s.CreateTime),
			UpdateTime:     timestamppb.New(s.UpdateTime),
		}
	}

	return &schedulerv1.ListSchedulesResponse{Schedules: protoSchedules}, nil
}

// ListJobs lists all job instances in the queue (pending, processing, failed).
func (h *Handler) ListJobs(ctx context.Context, req *schedulerv1.ListJobsRequest) (*schedulerv1.ListJobsResponse, error) {
	jobs, err := h.Engine.ListJobs(ctx, req.Status)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "list jobs: %v", err)
	}

	protoJobs := make([]*schedulerv1.JobInfo, len(jobs))
	for i, j := range jobs {
		var scheduleID string
		if j.ScheduleID != nil {
			scheduleID = *j.ScheduleID
		}
		var lastError string
		if j.LastError != nil {
			lastError = *j.LastError
		}

		protoJobs[i] = &schedulerv1.JobInfo{
			Id:          j.ID,
			ScheduleId:  scheduleID,
			JobType:     j.JobType,
			Payload:     j.Payload,
			RunAt:       timestamppb.New(j.RunAt),
			Status:      j.Status,
			Attempts:    int32(j.Attempts),
			MaxAttempts: int32(j.MaxAttempts),
			LastError:   lastError,
			CreateTime:  timestamppb.New(j.CreateTime),
			UpdateTime:  timestamppb.New(j.UpdateTime),
		}
	}

	return &schedulerv1.ListJobsResponse{Jobs: protoJobs}, nil
}

// TriggerSchedule manually spawns a job instance from a schedule template immediately.
func (h *Handler) TriggerSchedule(ctx context.Context, req *schedulerv1.TriggerScheduleRequest) (*emptypb.Empty, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if err := h.Engine.TriggerSchedule(ctx, req.Id); err != nil {
		return nil, status.Errorf(codes.Internal, "trigger schedule: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// PauseSchedule pauses a recurring schedule template.
func (h *Handler) PauseSchedule(ctx context.Context, req *schedulerv1.PauseScheduleRequest) (*emptypb.Empty, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if err := h.Engine.PauseSchedule(ctx, req.Id); err != nil {
		return nil, status.Errorf(codes.Internal, "pause schedule: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// ResumeSchedule resumes a paused recurring schedule template.
func (h *Handler) ResumeSchedule(ctx context.Context, req *schedulerv1.ResumeScheduleRequest) (*emptypb.Empty, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if err := h.Engine.ResumeSchedule(ctx, req.Id); err != nil {
		return nil, status.Errorf(codes.Internal, "resume schedule: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// RetryJob resets a failed job's attempt count and sets it to run immediately.
func (h *Handler) RetryJob(ctx context.Context, req *schedulerv1.RetryJobRequest) (*emptypb.Empty, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if err := h.Engine.RetryJob(ctx, req.Id); err != nil {
		return nil, status.Errorf(codes.Internal, "retry job: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// DeleteJob removes a job instance from the queue.
func (h *Handler) DeleteJob(ctx context.Context, req *schedulerv1.DeleteJobRequest) (*emptypb.Empty, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}
	if err := h.Engine.DeleteJob(ctx, req.Id); err != nil {
		return nil, status.Errorf(codes.Internal, "delete job: %v", err)
	}
	return &emptypb.Empty{}, nil
}

// GetSchedulerStatus returns the scheduler runtime status (worker count and queue size).
func (h *Handler) GetSchedulerStatus(ctx context.Context, req *schedulerv1.GetSchedulerStatusRequest) (*schedulerv1.GetSchedulerStatusResponse, error) {
	queueSize, err := h.Engine.GetQueueSize(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get queue size: %v", err)
	}

	return &schedulerv1.GetSchedulerStatusResponse{
		WorkerCount: int32(h.Engine.GetWorkerCount()),
		QueueSize:   int32(queueSize),
	}, nil
}
