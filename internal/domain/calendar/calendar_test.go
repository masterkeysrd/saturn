package calendar

import (
	"testing"
	"time"
)

func TestCalendarValidation(t *testing.T) {
	validID, err := GenerateCalendarID()
	if err != nil {
		t.Fatalf("failed to generate calendar ID: %v", err)
	}

	tests := []struct {
		name    string
		cal     *Calendar
		wantErr bool
	}{
		{
			name: "valid native calendar",
			cal: &Calendar{
				ID:         validID,
				SpaceID:    "spc_test1",
				Source:     SourceNative,
				Name:       "General Work",
				Timezone:   "America/New_York",
				AccessRole: AccessRoleOwner,
			},
			wantErr: false,
		},
		{
			name: "valid external calendar with connected account",
			cal: &Calendar{
				ID:                 validID,
				SpaceID:            "spc_test1",
				ConnectedAccountID: new("cac_google1"),
				Source:             SourceExternal,
				Name:               "Google Work",
				Timezone:           "Europe/London",
				AccessRole:         AccessRoleWriter,
			},
			wantErr: false,
		},
		{
			name: "invalid: native calendar with connected account",
			cal: &Calendar{
				ID:                 "cal_test3",
				SpaceID:            "spc_test1",
				ConnectedAccountID: new("cac_google1"),
				Source:             SourceNative,
				Name:               "Native",
				Timezone:           "UTC",
			},
			wantErr: true,
		},
		{
			name: "invalid: external calendar without connected account",
			cal: &Calendar{
				ID:       "cal_test4",
				SpaceID:  "spc_test1",
				Source:   SourceExternal,
				Name:     "External",
				Timezone: "UTC",
			},
			wantErr: true,
		},
		{
			name: "invalid: empty name",
			cal: &Calendar{
				ID:       "cal_test5",
				SpaceID:  "spc_test1",
				Source:   SourceNative,
				Name:     "   ",
				Timezone: "UTC",
			},
			wantErr: true,
		},
		{
			name: "invalid: missing space_id",
			cal: &Calendar{
				ID:       "cal_test6",
				SpaceID:  "",
				Source:   SourceNative,
				Name:     "Valid Name",
				Timezone: "UTC",
			},
			wantErr: true,
		},
		{
			name: "invalid: bad timezone",
			cal: &Calendar{
				ID:       "cal_test7",
				SpaceID:  "spc_test1",
				Source:   SourceNative,
				Name:     "Valid Name",
				Timezone: "Mars/Olympus",
			},
			wantErr: true,
		},
		{
			name: "invalid: bad access role",
			cal: &Calendar{
				ID:         "cal_test8",
				SpaceID:    "spc_test1",
				Source:     SourceNative,
				Name:       "Valid Name",
				Timezone:   "UTC",
				AccessRole: AccessRole("superadmin"),
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cal.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() error = %v, wantErr = %v", err, tt.wantErr)
			}
		})
	}
}

func TestCalendarPermissions(t *testing.T) {
	tests := []struct {
		role      AccessRole
		canWrite  bool
		canManage bool
	}{
		{role: AccessRoleOwner, canWrite: true, canManage: true},
		{role: AccessRoleWriter, canWrite: true, canManage: false},
		{role: AccessRoleReader, canWrite: false, canManage: false},
		{role: AccessRoleFreeBusy, canWrite: false, canManage: false},
	}

	for _, tt := range tests {
		t.Run(string(tt.role), func(t *testing.T) {
			cal := &Calendar{AccessRole: tt.role}
			if cal.CanWrite() != tt.canWrite {
				t.Errorf("CanWrite() = %v, want %v", cal.CanWrite(), tt.canWrite)
			}
			if cal.CanManage() != tt.canManage {
				t.Errorf("CanManage() = %v, want %v", cal.CanManage(), tt.canManage)
			}
		})
	}
}

func TestCalendarApplyPatch(t *testing.T) {
	validID, _ := GenerateCalendarID()
	cal := &Calendar{
		ID:         validID,
		SpaceID:    "spc_test",
		Source:     SourceNative,
		Name:       "Old Name",
		Timezone:   "UTC",
		AccessRole: AccessRoleOwner,
		IsEnabled:  true,
		CreateTime: time.Now().UTC(),
		UpdateTime: time.Now().UTC(),
	}

	incoming := &Calendar{
		Name:      "New Name",
		Timezone:  "America/Los_Angeles",
		IsEnabled: false,
	}

	err := cal.ApplyPatch(incoming, []string{"name", "timezone", "is_enabled"})
	if err != nil {
		t.Fatalf("ApplyPatch() failed: %v", err)
	}

	if cal.Name != "New Name" {
		t.Errorf("Name = %s, want 'New Name'", cal.Name)
	}
	if cal.Timezone != "America/Los_Angeles" {
		t.Errorf("Timezone = %s, want 'America/Los_Angeles'", cal.Timezone)
	}
	if cal.IsEnabled != false {
		t.Errorf("IsEnabled = %v, want false", cal.IsEnabled)
	}
}
