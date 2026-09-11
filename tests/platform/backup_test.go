package platform_test

import (
	"fmt"
	"strings"
	"testing"
	"time"

	backupv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/backup/v1"
	transportscheduler "github.com/masterkeysrd/saturn/internal/transport/scheduler"
	"github.com/masterkeysrd/saturn/tests/driver"
)

func TestBackup_SecurityGuards(t *testing.T) {
	d := driver.New(t, testEnv)

	// 1. Unauthenticated requests must be rejected
	_, err := d.Backup().TriggerBackup(t, driver.TriggerBackupOptions{Unauthenticated: true})
	if err == nil {
		t.Fatal("expected unauthenticated TriggerBackup to fail, but succeeded")
	}

	_, err = d.Backup().ListBackups(t, driver.ListBackupsOptions{Unauthenticated: true})
	if err == nil {
		t.Fatal("expected unauthenticated ListBackups to fail, but succeeded")
	}

	// 2. Regular (non-admin) member must be rejected with permission denied
	nano := time.Now().UnixNano()
	email := fmt.Sprintf("regular_%d@saturn.local", nano)
	password := "SecretPass123!"
	username := fmt.Sprintf("user_%d", nano)

	user, err := d.Auth().RegisterUser(t, driver.RegisterUserOptions{
		Name:     "Regular Member",
		Email:    email,
		Username: username,
		Password: password,
	})
	if err != nil {
		t.Fatalf("failed to register user: %v", err)
	}

	_, err = d.Auth().ApproveUser(t, user.GetId())
	if err != nil {
		t.Fatalf("failed to approve user: %v", err)
	}

	loginResp, err := d.Auth().LoginAs(t, email, password)
	if err != nil {
		t.Fatalf("failed to login regular user: %v", err)
	}
	regularToken := loginResp.GetAccessToken()

	_, err = d.Backup().TriggerBackup(t, driver.TriggerBackupOptions{Token: regularToken})
	if err == nil {
		t.Fatal("expected regular member TriggerBackup to fail with permission denied, but succeeded")
	}

	_, err = d.Backup().ListBackups(t, driver.ListBackupsOptions{Token: regularToken})
	if err == nil {
		t.Fatal("expected regular member ListBackups to fail with permission denied, but succeeded")
	}
}

func TestBackup_TriggerAndList(t *testing.T) {
	d := driver.New(t, testEnv)

	// 1. Initial backup index should be empty
	initialResp, err := d.Backup().ListBackups(t, driver.ListBackupsOptions{})
	if err != nil {
		t.Fatalf("failed to list initial backups: %v", err)
	}
	if len(initialResp.GetBackups()) != 0 {
		t.Fatalf("expected 0 initial backups, got %d", len(initialResp.GetBackups()))
	}

	// 2. Trigger manual backup as admin
	entry1, err := d.Backup().TriggerBackup(t, driver.TriggerBackupOptions{})
	if err != nil {
		t.Fatalf("failed to trigger backup: %v", err)
	}

	if entry1.GetId() == "" || !strings.HasPrefix(entry1.GetId(), "bak_") {
		t.Errorf("backup ID = %s, want prefix bak_", entry1.GetId())
	}
	if !strings.HasPrefix(entry1.GetFilename(), "saturn_backup_") || !strings.HasSuffix(entry1.GetFilename(), ".sql") {
		t.Errorf("unexpected backup filename: %s", entry1.GetFilename())
	}
	if entry1.GetSizeBytes() <= 0 {
		t.Errorf("backup size_bytes = %d, want > 0", entry1.GetSizeBytes())
	}
	if entry1.GetStatus() != "success" {
		t.Errorf("backup status = %s, want success", entry1.GetStatus())
	}
	if len(entry1.GetSha256()) != 64 {
		t.Errorf("backup sha256 length = %d, want 64", len(entry1.GetSha256()))
	}
	if !strings.HasPrefix(entry1.GetTriggeredBy(), "web_admin_") {
		t.Errorf("backup triggered_by = %s, want prefix web_admin_", entry1.GetTriggeredBy())
	}
	if entry1.GetCreatedAt() == nil {
		t.Errorf("expected non-nil created_at timestamp")
	}

	// 3. Verify backup file exists and matches sha256 checksum on disk
	if err := d.Backup().VerifyBackup(t, driver.VerifyBackupOptions{Entry: entry1}); err != nil {
		t.Fatalf("failed to verify backup on disk: %v", err)
	}

	content, err := d.Backup().GetBackupContent(t, driver.GetBackupContentOptions{Filename: entry1.GetFilename()})
	if err != nil {
		t.Fatalf("failed to read backup file content: %v", err)
	}
	if int64(len(content)) != entry1.GetSizeBytes() {
		t.Errorf("read backup content length = %d, want %d", len(content), entry1.GetSizeBytes())
	}

	// 4. List backups and verify index contains entry1
	listResp, err := d.Backup().ListBackups(t, driver.ListBackupsOptions{})
	if err != nil {
		t.Fatalf("failed to list backups: %v", err)
	}
	if len(listResp.GetBackups()) != 1 {
		t.Fatalf("expected 1 backup in list, got %d", len(listResp.GetBackups()))
	}
	if listResp.GetBackups()[0].GetId() != entry1.GetId() {
		t.Errorf("backup entry ID = %s, want %s", listResp.GetBackups()[0].GetId(), entry1.GetId())
	}

	// 5. Trigger a second backup (wait 1.1s for distinct timestamp in filename)
	time.Sleep(1100 * time.Millisecond)
	entry2, err := d.Backup().TriggerBackup(t, driver.TriggerBackupOptions{})
	if err != nil {
		t.Fatalf("failed to trigger second backup: %v", err)
	}
	if entry2.GetId() == entry1.GetId() {
		t.Errorf("expected distinct ID for second backup, got %s", entry2.GetId())
	}

	// 6. List backups again and verify both entries exist
	listResp2, err := d.Backup().ListBackups(t, driver.ListBackupsOptions{})
	if err != nil {
		t.Fatalf("failed to list backups after second trigger: %v", err)
	}
	if len(listResp2.GetBackups()) != 2 {
		t.Fatalf("expected 2 backups in list, got %d", len(listResp2.GetBackups()))
	}
}

func TestBackup_SchedulerIntegration(t *testing.T) {
	d := driver.New(t, testEnv)

	// Ensure daily backup schedule is registered in scheduler (ResetDB truncates platform.schedule)
	if err := transportscheduler.RegisterBackupSchedules(t.Context(), d.Env().Scheduler()); err != nil {
		t.Fatalf("failed to register backup schedule: %v", err)
	}

	// 1. Verify recurring database_backup_daily schedule is registered
	schedResp, err := d.Platform().ListSchedules(t)
	if err != nil {
		t.Fatalf("failed to list schedules: %v", err)
	}

	var foundBackupSched bool
	for _, s := range schedResp.GetSchedules() {
		if s.GetId() == "database_backup_daily" {
			foundBackupSched = true
			if s.GetJobType() != "backup.RunDatabaseBackup" {
				t.Errorf("schedule job_type = %s, want backup.RunDatabaseBackup", s.GetJobType())
			}
			break
		}
	}
	if !foundBackupSched {
		t.Fatalf("expected database_backup_daily schedule to be registered")
	}

	// 2. Trigger the backup schedule manually
	if err := d.Platform().TriggerSchedule(t, "database_backup_daily"); err != nil {
		t.Fatalf("failed to trigger backup schedule: %v", err)
	}

	// 3. Poll backup index until scheduler-triggered backup appears
	var schedulerEntry *backupv1.BackupEntry
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := d.Backup().ListBackups(t, driver.ListBackupsOptions{})
		if err == nil {
			for _, b := range resp.GetBackups() {
				if b.GetTriggeredBy() == "scheduler" {
					schedulerEntry = b
					break
				}
			}
		}
		if schedulerEntry != nil {
			break
		}
		time.Sleep(100 * time.Millisecond)
	}

	if schedulerEntry == nil {
		t.Fatalf("timed out waiting for scheduler backup to appear in backup index")
	}

	// 4. Verify the scheduler backup metadata and disk file integrity
	if schedulerEntry.GetStatus() != "success" {
		t.Errorf("scheduler backup status = %s, want success", schedulerEntry.GetStatus())
	}
	if schedulerEntry.GetSizeBytes() <= 0 {
		t.Errorf("scheduler backup size_bytes = %d, want > 0", schedulerEntry.GetSizeBytes())
	}
	if err := d.Backup().VerifyBackup(t, driver.VerifyBackupOptions{Entry: schedulerEntry}); err != nil {
		t.Fatalf("failed to verify scheduler backup on disk: %v", err)
	}
}
