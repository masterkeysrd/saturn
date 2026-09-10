package scheduler

import (
	"context"

	backupv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/backup/v1"
	"github.com/masterkeysrd/saturn/internal/platform/backup"
	"github.com/masterkeysrd/saturn/internal/platform/scheduler"
)

// BackupManager outlines the scheduler dependencies on the backup manager.
type BackupManager interface {
	RunBackup(ctx context.Context, triggeredBy string) (*backup.BackupEntry, error)
}

// RegisterBackupJobs binds backup background jobs to the scheduler engine.
func RegisterBackupJobs(engine *scheduler.Engine, mgr BackupManager) {
	backupv1.RegisterRunDatabaseBackupPayload(engine, func(ctx context.Context, payload *backupv1.RunDatabaseBackupPayload) error {
		_, err := mgr.RunBackup(ctx, "scheduler")
		return err
	})
}

// RegisterBackupSchedules seeds recurring backup cron triggers into the scheduler engine.
func RegisterBackupSchedules(ctx context.Context, engine *scheduler.Engine) error {
	return engine.RegisterSchedule(ctx, scheduler.Schedule{
		ID:             "database_backup_daily",
		JobType:        "backup.RunDatabaseBackup",
		CronExpression: "0 0 2 * * *", // Run daily at 02:00 AM UTC
		Payload:        struct{}{},
	})
}
