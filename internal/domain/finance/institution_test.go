package finance_test

import (
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestInstitutionID(t *testing.T) {
	instID, err := finance.NewInstitutionID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		name    string
		id      finance.InstitutionID
		wantErr bool
	}{
		{"valid institution ID", instID, false},
		{"invalid prefix", "acc_12345", true},
		{"empty", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.id.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.id.String() != string(instID) {
				t.Errorf("String() = %q, want %q", tt.id.String(), instID)
			}
		})
	}
}

func TestInstitution_Validate(t *testing.T) {
	validID, _ := finance.NewInstitutionID()
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	tests := []struct {
		name    string
		inst    finance.Institution
		wantErr bool
	}{
		{
			name: "valid institution",
			inst: finance.Institution{
				ID:      validID,
				SpaceID: validSpace,
				Name:    "Chase",
				Domain:  "chase.com",
				LogoURL: "https://chase.com/favicon.ico",
				Color:   "blue",
			},
			wantErr: false,
		},
		{
			name: "empty name",
			inst: finance.Institution{
				ID:      validID,
				SpaceID: validSpace,
				Name:    "   ",
			},
			wantErr: true,
		},
		{
			name: "name exceeds 255 chars",
			inst: finance.Institution{
				ID:      validID,
				SpaceID: validSpace,
				Name:    strings.Repeat("a", 256),
			},
			wantErr: true,
		},
		{
			name: "invalid institution ID",
			inst: finance.Institution{
				ID:      "invalid_id",
				SpaceID: validSpace,
				Name:    "Chase",
			},
			wantErr: true,
		},
		{
			name: "invalid space ID",
			inst: finance.Institution{
				ID:      validID,
				SpaceID: "invalid_space",
				Name:    "Chase",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inst := tt.inst
			err := inst.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil && inst.Color == "" {
				t.Error("expected default color to be populated")
			}
		})
	}
}

func TestInstitution_Init(t *testing.T) {
	tests := []struct {
		name       string
		inst       finance.Institution
		wantDomain string
	}{
		{
			name: "init with auto domain and logo",
			inst: finance.Institution{
				Name: "chase.com",
			},
			wantDomain: "chase.com",
		},
		{
			name: "init with existing domain",
			inst: finance.Institution{
				Name:   "Custom Bank",
				Domain: "custombank.io",
			},
			wantDomain: "custombank.io",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inst := tt.inst
			err := inst.Init()
			if err != nil {
				t.Fatalf("Init() error = %v", err)
			}
			if inst.ID == "" {
				t.Error("expected ID to be set")
			}
			if inst.Domain != tt.wantDomain {
				t.Errorf("Domain = %q, want %q", inst.Domain, tt.wantDomain)
			}
			if inst.LogoURL == "" {
				t.Error("expected LogoURL to be generated")
			}
			if inst.CreateTime.IsZero() || inst.UpdateTime.IsZero() {
				t.Error("expected timestamps to be set")
			}
		})
	}
}

func TestInstitution_ApplyPatch(t *testing.T) {
	validID, _ := finance.NewInstitutionID()
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	original := &finance.Institution{
		ID:      validID,
		SpaceID: validSpace,
		Name:    "Old Bank",
		Domain:  "oldbank.com",
		LogoURL: "https://oldbank.com/icon.png",
		Color:   "blue",
	}

	tests := []struct {
		name     string
		incoming finance.Institution
		mask     []string
		wantErr  bool
	}{
		{
			name: "patch name and color",
			incoming: finance.Institution{
				Name:  "New Bank",
				Color: "green",
			},
			mask:    []string{"name", "color"},
			wantErr: false,
		},
		{
			name: "patch invalid name",
			incoming: finance.Institution{
				Name: "",
			},
			mask:    []string{"name"},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inst := *original
			err := inst.ApplyPatch(&tt.incoming, tt.mask)
			if (err != nil) != tt.wantErr {
				t.Errorf("ApplyPatch() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
