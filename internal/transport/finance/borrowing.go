package finance

import (
	"context"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	financeaggregator "github.com/masterkeysrd/saturn/internal/aggregator/finance"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

func (h *Handler) CreateBorrowing(ctx context.Context, req *financev1.CreateBorrowingRequest) (*financev1.Borrowing, error) {
	input := req.GetBorrowing()
	if input == nil {
		return nil, status.Error(codes.InvalidArgument, "missing borrowing payload")
	}

	currency, err := finance.ParseCurrency(input.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var establishedAt time.Time
	if input.GetEstablishedAt() != nil {
		establishedAt = input.GetEstablishedAt().AsTime()
	} else {
		establishedAt = time.Now().UTC()
	}

	var dueAt *time.Time
	if input.GetDueAt() != nil {
		t := input.GetDueAt().AsTime()
		dueAt = &t
	}

	var accountID *finance.AccountID
	if input.AccountId != nil && *input.AccountId != "" {
		idVal := finance.AccountID(*input.AccountId)
		accountID = &idVal
	}

	appReq := &financeapp.CreateBorrowingRequest{
		Direction:           toDomainBorrowingDirection(input.GetDirection()),
		Counterparty:        input.GetCounterparty(),
		ContactInfo:         input.GetContactInfo(),
		TotalAmount:         input.GetTotalAmount(),
		Currency:            string(currency),
		EstablishedAt:       establishedAt,
		DueAt:               dueAt,
		Notes:               input.GetNotes(),
		CreateAsTransaction: input.GetCreateAsTransaction(),
		AccountID:           accountID,
	}

	b, err := h.Coordinator.CreateBorrowing(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBorrowing(b), nil
}

func (h *Handler) GetBorrowing(ctx context.Context, req *financev1.GetBorrowingRequest) (*financev1.Borrowing, error) {
	bID, err := finance.ParseBorrowingID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	b, err := h.Aggregator.GetBorrowing(ctx, spaceID, bID)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBorrowing(b), nil
}

func (h *Handler) ListBorrowings(ctx context.Context, req *financev1.ListBorrowingsRequest) (*financev1.ListBorrowingsResponse, error) {
	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	filter := financeaggregator.ListBorrowingsFilter{
		ListBorrowingsFilter: finance.ListBorrowingsFilter{
			PageSize:      req.GetPageSize(),
			NextPageToken: req.GetPageToken(),
			Sort:          sorting.Parse(req.GetOrderBy()),
		},
	}

	if req.Status != nil && *req.Status != financev1.Borrowing_STATUS_UNSPECIFIED {
		sStr := req.Status.String()
		switch *req.Status {
		case financev1.Borrowing_ACTIVE:
			sStr = "ACTIVE"
		case financev1.Borrowing_PAID_OFF:
			sStr = "PAID_OFF"
		}
		statusVal := finance.BorrowingStatus(sStr)
		filter.Status = &statusVal
	}

	if req.Direction != nil && *req.Direction != financev1.Borrowing_DIRECTION_UNSPECIFIED {
		dStr := req.Direction.String()
		switch *req.Direction {
		case financev1.Borrowing_BORROWED:
			dStr = "BORROWED"
		case financev1.Borrowing_LENT:
			dStr = "LENT"
		}
		directionVal := finance.BorrowingDirection(dStr)
		filter.Direction = &directionVal
	}

	list, nextToken, err := h.Aggregator.ListBorrowings(ctx, spaceID, filter)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoList := make([]*financev1.Borrowing, 0, len(list))
	for _, b := range list {
		protoList = append(protoList, toProtoBorrowing(b))
	}

	return &financev1.ListBorrowingsResponse{
		Borrowings:    protoList,
		NextPageToken: nextToken,
	}, nil
}

func (h *Handler) UpdateBorrowing(ctx context.Context, req *financev1.UpdateBorrowingRequest) (*financev1.Borrowing, error) {
	input := req.GetBorrowing()
	if input == nil {
		return nil, status.Error(codes.InvalidArgument, "missing borrowing payload")
	}

	currency, err := finance.ParseCurrency(input.GetCurrency())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var establishedAt time.Time
	if input.GetEstablishedAt() != nil {
		establishedAt = input.GetEstablishedAt().AsTime()
	} else {
		establishedAt = time.Now().UTC()
	}

	var dueAt *time.Time
	if input.GetDueAt() != nil {
		t := input.GetDueAt().AsTime()
		dueAt = &t
	}

	bID, err := finance.ParseBorrowingID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var accountID *finance.AccountID
	if input.AccountId != nil && *input.AccountId != "" {
		idVal := finance.AccountID(*input.AccountId)
		accountID = &idVal
	}

	var versionVal int64
	if req.Version != nil {
		versionVal = *req.Version
	} else if input.Version > 0 {
		versionVal = input.Version
	}

	appReq := &financeapp.UpdateBorrowingRequest{
		ID:            bID,
		Direction:     toDomainBorrowingDirection(input.GetDirection()),
		Counterparty:  input.GetCounterparty(),
		ContactInfo:   input.GetContactInfo(),
		TotalAmount:   input.GetTotalAmount(),
		Currency:      string(currency),
		EstablishedAt: establishedAt,
		DueAt:         dueAt,
		Notes:         input.GetNotes(),
		AccountID:     accountID,
		Version:       versionVal,
		UpdateMask:    req.GetUpdateMask().GetPaths(),
	}

	b, err := h.Coordinator.UpdateBorrowing(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBorrowing(b), nil
}

func (h *Handler) DeleteBorrowing(ctx context.Context, req *financev1.DeleteBorrowingRequest) (*emptypb.Empty, error) {
	bID, err := finance.ParseBorrowingID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	err = h.Coordinator.DeleteBorrowing(ctx, bID)
	if err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) LogBorrowingTransaction(ctx context.Context, req *financev1.LogBorrowingTransactionRequest) (*financev1.Transaction, error) {
	bID, err := finance.ParseBorrowingID(req.GetBorrowingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	txn := req.GetTransaction()
	if txn == nil {
		return nil, status.Error(codes.InvalidArgument, "missing transaction payload")
	}

	var accountIDPtr *finance.AccountID
	if txn.AccountId != nil && *txn.AccountId != "" {
		aID, parseErr := finance.ParseAccountID(*txn.AccountId)
		if parseErr != nil {
			return nil, status.Error(codes.InvalidArgument, parseErr.Error())
		}
		accountIDPtr = &aID
	}

	var parsedDate time.Time
	if txn.TransactionDate != nil && *txn.TransactionDate != "" {
		if t, pErr := time.Parse(time.RFC3339, *txn.TransactionDate); pErr == nil {
			parsedDate = t
		} else if t, pErr := time.Parse("2006-01-02", *txn.TransactionDate); pErr == nil {
			parsedDate = t
		}
	}

	domainType := finance.BorrowingTransactionTypePayment
	if txn.GetType() == financev1.BorrowingTransactionType_BORROWING_TRANSACTION_TYPE_DISBURSEMENT {
		domainType = finance.BorrowingTransactionTypeDisbursement
	}

	res, err := h.Coordinator.LogBorrowingTransaction(ctx, &financeapp.LogBorrowingTransactionRequest{
		BorrowingID:     bID,
		Type:            domainType,
		Amount:          txn.GetAmount(),
		TransactionDate: parsedDate,
		AccountID:       accountIDPtr,
		Notes:           txn.GetNotes(),
	})
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(res), nil
}

func (h *Handler) UpdateBorrowingTransaction(ctx context.Context, req *financev1.UpdateBorrowingTransactionRequest) (*financev1.Transaction, error) {
	bID, err := finance.ParseBorrowingID(req.GetBorrowingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	tID, err := finance.ParseTransactionID(req.GetTransactionId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	txn := req.GetTransaction()
	if txn == nil {
		return nil, status.Error(codes.InvalidArgument, "missing transaction payload")
	}

	var accountIDPtr *finance.AccountID
	if txn.AccountId != nil && *txn.AccountId != "" {
		aID, parseErr := finance.ParseAccountID(*txn.AccountId)
		if parseErr != nil {
			return nil, status.Error(codes.InvalidArgument, parseErr.Error())
		}
		accountIDPtr = &aID
	}

	var parsedDate time.Time
	if txn.TransactionDate != nil && *txn.TransactionDate != "" {
		if t, pErr := time.Parse(time.RFC3339, *txn.TransactionDate); pErr == nil {
			parsedDate = t
		} else if t, pErr := time.Parse("2006-01-02", *txn.TransactionDate); pErr == nil {
			parsedDate = t
		}
	}

	domainType := finance.BorrowingTransactionTypePayment
	if txn.GetType() == financev1.BorrowingTransactionType_BORROWING_TRANSACTION_TYPE_DISBURSEMENT {
		domainType = finance.BorrowingTransactionTypeDisbursement
	}

	res, err := h.Coordinator.UpdateBorrowingTransaction(ctx, &financeapp.UpdateBorrowingTransactionRequest{
		BorrowingID:     bID,
		TransactionID:   tID,
		Type:            domainType,
		Amount:          txn.GetAmount(),
		TransactionDate: parsedDate,
		AccountID:       accountIDPtr,
		Notes:           txn.GetNotes(),
	})
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoTransaction(res), nil
}

func (h *Handler) DeleteBorrowingTransaction(ctx context.Context, req *financev1.DeleteBorrowingTransactionRequest) (*emptypb.Empty, error) {
	bID, err := finance.ParseBorrowingID(req.GetBorrowingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	tID, err := finance.ParseTransactionID(req.GetTransactionId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	err = h.Coordinator.DeleteBorrowingTransaction(ctx, &financeapp.DeleteBorrowingTransactionRequest{
		BorrowingID:   bID,
		TransactionID: tID,
	})
	if err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
}

func (h *Handler) AdjustBorrowingBalance(ctx context.Context, req *financev1.AdjustBorrowingBalanceRequest) (*financev1.Borrowing, error) {
	bID, err := finance.ParseBorrowingID(req.GetBorrowingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var accountIDPtr *finance.AccountID
	if req.AccountId != nil && *req.AccountId != "" {
		aID, parseErr := finance.ParseAccountID(*req.AccountId)
		if parseErr != nil {
			return nil, status.Error(codes.InvalidArgument, parseErr.Error())
		}
		accountIDPtr = &aID
	}

	appReq := &financeapp.AdjustBorrowingBalanceRequest{
		BorrowingID:    bID,
		TargetBalance:  req.GetTargetBalance(),
		AdjustmentDate: req.GetAdjustmentDate(),
		Notes:          req.GetNotes(),
		AccountID:      accountIDPtr,
	}

	b, err := h.Coordinator.AdjustBorrowingBalance(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBorrowing(b), nil
}

// Mappers
func toDomainBorrowingDirection(d financev1.Borrowing_Direction) string {
	switch d {
	case financev1.Borrowing_BORROWED:
		return string(finance.BorrowingDirectionBorrowed)
	case financev1.Borrowing_LENT:
		return string(finance.BorrowingDirectionLent)
	default:
		return ""
	}
}

func toProtoBorrowingDirection(d finance.BorrowingDirection) financev1.Borrowing_Direction {
	switch d {
	case finance.BorrowingDirectionBorrowed:
		return financev1.Borrowing_BORROWED
	case finance.BorrowingDirectionLent:
		return financev1.Borrowing_LENT
	default:
		return financev1.Borrowing_DIRECTION_UNSPECIFIED
	}
}

func toProtoBorrowingStatus(s finance.BorrowingStatus) financev1.Borrowing_Status {
	switch s {
	case finance.BorrowingStatusActive:
		return financev1.Borrowing_ACTIVE
	case finance.BorrowingStatusPaidOff:
		return financev1.Borrowing_PAID_OFF
	default:
		return financev1.Borrowing_STATUS_UNSPECIFIED
	}
}

func toProtoBorrowing(b *finance.Borrowing) *financev1.Borrowing {
	if b == nil {
		return nil
	}

	var dueAt *timestamppb.Timestamp
	if b.DueAt != nil {
		dueAt = timestamppb.New(*b.DueAt)
	}

	return &financev1.Borrowing{
		Id:                  string(b.ID),
		SpaceId:             string(b.SpaceID),
		Direction:           toProtoBorrowingDirection(b.Direction),
		Counterparty:        b.Counterparty,
		ContactInfo:         b.ContactInfo,
		TotalAmount:         b.TotalAmount,
		RemainingAmount:     b.RemainingAmount,
		Currency:            string(b.Currency),
		Status:              toProtoBorrowingStatus(b.Status),
		EstablishedAt:       timestamppb.New(b.EstablishedAt),
		DueAt:               dueAt,
		Notes:               b.Notes,
		Version:             b.Version,
		CreateTime:          timestamppb.New(b.CreateTime),
		UpdateTime:          timestamppb.New(b.UpdateTime),
		CreateAsTransaction: false,
	}
}
