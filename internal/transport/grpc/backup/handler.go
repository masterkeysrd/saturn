package backup

import (
	"context"

	backupv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/backup/v1"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/backup"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Handler implements the BackupAdmin gRPC service.
type Handler struct {
	backupv1.UnimplementedBackupAdminServer
	manager backup.BackupManager
}

// NewHandler instantiates a new BackupAdmin gRPC Handler.
func NewHandler(manager backup.BackupManager) *Handler {
	return &Handler{
		manager: manager,
	}
}

// ListBackups handles fetching the logs index array.
func (h *Handler) ListBackups(ctx context.Context, req *backupv1.ListBackupsRequest) (*backupv1.ListBackupsResponse, error) {
	const op errors.Op = "transport/grpc/backup.ListBackups"

	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing principal")
	}

	if principal.AccessLevel != "admin" {
		return nil, errors.E(op, errors.Permission, "admin privilege required")
	}

	index, err := h.manager.ListBackups(ctx)
	if err != nil {
		return nil, errors.E(op, err)
	}

	resp := &backupv1.ListBackupsResponse{
		LastUpdated: timestamppb.New(index.LastUpdated),
		Backups:     make([]*backupv1.BackupEntry, 0, len(index.Backups)),
	}

	for _, b := range index.Backups {
		resp.Backups = append(resp.Backups, &backupv1.BackupEntry{
			Id:          b.ID,
			Filename:    b.Filename,
			SizeBytes:   b.SizeBytes,
			TriggeredBy: b.TriggeredBy,
			Status:      b.Status,
			Sha256:      b.Sha256,
			CreatedAt:   timestamppb.New(b.CreatedAt),
		})
	}

	return resp, nil
}

// TriggerBackup triggers a manual backup run.
func (h *Handler) TriggerBackup(ctx context.Context, req *backupv1.TriggerBackupRequest) (*backupv1.TriggerBackupResponse, error) {
	const op errors.Op = "transport/grpc/backup.TriggerBackup"

	principal, ok := auth.PrincipalFromContext(ctx)
	if !ok {
		return nil, errors.E(op, errors.Unauthenticated, "missing principal")
	}

	if principal.AccessLevel != "admin" {
		return nil, errors.E(op, errors.Permission, "admin privilege required")
	}

	entry, err := h.manager.RunBackup(ctx, "web_admin_"+principal.Subject)
	if err != nil {
		return nil, errors.E(op, err)
	}

	return &backupv1.TriggerBackupResponse{
		Backup: &backupv1.BackupEntry{
			Id:          entry.ID,
			Filename:    entry.Filename,
			SizeBytes:   entry.SizeBytes,
			TriggeredBy: entry.TriggeredBy,
			Status:      entry.Status,
			Sha256:      entry.Sha256,
			CreatedAt:   timestamppb.New(entry.CreatedAt),
		},
	}, nil
}
