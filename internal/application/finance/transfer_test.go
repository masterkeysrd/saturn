package financeapp

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCreateTransferRequest_Fields(t *testing.T) {
	now := time.Now().UTC()
	req := &CreateTransferRequest{
		SourceAccountID:      "acc_source",
		DestinationAccountID: "acc_dest",
		SourceAmount:         10000,
		DestinationAmount:    10000,
		TransferDate:         now,
		Notes:                "Savings deposit",
	}

	if req.SourceAccountID != "acc_source" || req.DestinationAccountID != "acc_dest" {
		t.Errorf("unexpected transfer source/dest accounts")
	}
	if req.SourceAmount != 10000 || req.DestinationAmount != 10000 {
		t.Errorf("unexpected transfer amounts")
	}
}

func TestListTransfersRequest_Fields(t *testing.T) {
	req := &ListTransfersRequest{
		Limit:     20,
		PageToken: "tok_1",
	}

	if req.Limit != 20 || req.PageToken != "tok_1" {
		t.Errorf("unexpected list transfers filter")
	}
}

func TestCoordinator_CreateTransfer(t *testing.T) {
	now := time.Now().UTC()
	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateTransferRequest
		mockFn        func(ctx context.Context, transfer *finance.Transfer) (*finance.Transfer, error)
		expectedID    finance.TransferID
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateTransferRequest{
				SourceAccountID:      "acc_1",
				DestinationAccountID: "acc_2",
				SourceAmount:         5000,
				DestinationAmount:    5000,
				TransferDate:         now,
				Notes:                "Test transfer",
			},
			mockFn: func(ctx context.Context, transfer *finance.Transfer) (*finance.Transfer, error) {
				if transfer.SpaceID != "spc_1" || transfer.SourceAccountID != "acc_1" || transfer.DestinationAccountID != "acc_2" {
					t.Errorf("unexpected transfer payload: %+v", transfer)
				}
				return &finance.Transfer{ID: "trf_1", SpaceID: transfer.SpaceID}, nil
			},
			expectedID:    "trf_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &CreateTransferRequest{SourceAccountID: "acc_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &CreateTransferRequest{SourceAccountID: "acc_1"},
			mockFn: func(ctx context.Context, transfer *finance.Transfer) (*finance.Transfer, error) {
				return nil, errors.New("insufficient funds")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{CreateTransferFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.CreateTransfer(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_GetTransfer(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		id            finance.TransferID
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) (*finance.Transfer, error)
		expectedID    finance.TransferID
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "trf_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) (*finance.Transfer, error) {
				if spaceID != "spc_1" || id != "trf_1" {
					t.Errorf("unexpected get transfer args: space=%v id=%v", spaceID, id)
				}
				return &finance.Transfer{ID: id, SpaceID: spaceID}, nil
			},
			expectedID:    "trf_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			id:            "trf_1",
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "trf_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) (*finance.Transfer, error) {
				return nil, errors.New("transfer not found")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{GetTransferFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.GetTransfer(tc.ctx, tc.id)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_DeleteTransfer(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		id            finance.TransferID
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) error
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "trf_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) error {
				if spaceID != "spc_1" || id != "trf_1" {
					t.Errorf("unexpected delete args: space=%v id=%v", spaceID, id)
				}
				return nil
			},
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			id:            "trf_1",
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			id:   "trf_1",
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) error {
				return errors.New("delete failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{DeleteTransferFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			err := coord.DeleteTransfer(tc.ctx, tc.id)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestCoordinator_ListTransfers(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *ListTransfersRequest
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, limit int32, pageToken string) ([]*finance.Transfer, string, error)
		expectedCount int
		expectedToken string
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &ListTransfersRequest{
				Limit:     25,
				PageToken: "page_tok",
			},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, limit int32, pageToken string) ([]*finance.Transfer, string, error) {
				if spaceID != "spc_1" || limit != 25 || pageToken != "page_tok" {
					t.Errorf("unexpected list transfers args: space=%v limit=%v tok=%v", spaceID, limit, pageToken)
				}
				return []*finance.Transfer{{ID: "trf_1"}, {ID: "trf_2"}}, "next_page", nil
			},
			expectedCount: 2,
			expectedToken: "next_page",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &ListTransfersRequest{},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &ListTransfersRequest{},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, limit int32, pageToken string) ([]*finance.Transfer, string, error) {
				return nil, "", errors.New("list failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{ListTransfersFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			transfers, token, err := coord.ListTransfers(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(transfers) != tc.expectedCount || token != tc.expectedToken {
				t.Errorf("expected count %d and token %q, got %d and %q", tc.expectedCount, tc.expectedToken, len(transfers), token)
			}
		})
	}
}
