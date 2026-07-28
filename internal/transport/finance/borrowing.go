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

func (h *Handler) CreateBorrowingRepayment(ctx context.Context, req *financev1.CreateBorrowingRepaymentRequest) (*financev1.BorrowingRepayment, error) {
	input := req.GetRepayment()
	if input == nil {
		return nil, status.Error(codes.InvalidArgument, "missing repayment payload")
	}

	bID, err := finance.ParseBorrowingID(req.GetBorrowingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	aID, err := finance.ParseAccountID(input.GetAccountId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	var paymentDate time.Time
	if input.GetPaymentDate() != nil {
		paymentDate = input.GetPaymentDate().AsTime()
	} else {
		paymentDate = time.Now().UTC()
	}

	appReq := &financeapp.CreateBorrowingRepaymentRequest{
		BorrowingID: bID,
		Amount:      input.GetAmount(),
		PaymentDate: paymentDate,
		Notes:       input.GetNotes(),
		AccountID:   aID,
	}

	r, err := h.Coordinator.CreateBorrowingRepayment(ctx, appReq)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBorrowingRepayment(r), nil
}

func (h *Handler) ListBorrowingRepayments(ctx context.Context, req *financev1.ListBorrowingRepaymentsRequest) (*financev1.ListBorrowingRepaymentsResponse, error) {
	bID, err := finance.ParseBorrowingID(req.GetBorrowingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	spaceIDStr, ok := auth.SpaceIDFromContext(ctx)
	if !ok {
		return nil, status.Error(codes.Unauthenticated, "missing space-id context")
	}
	spaceID := finance.SpaceID(spaceIDStr)

	list, err := h.Aggregator.ListBorrowingRepayments(ctx, spaceID, bID)
	if err != nil {
		return nil, h.mapError(err)
	}

	protoList := make([]*financev1.BorrowingRepayment, 0, len(list))
	for _, r := range list {
		protoList = append(protoList, toProtoBorrowingRepayment(r))
	}

	return &financev1.ListBorrowingRepaymentsResponse{
		Repayments: protoList,
	}, nil
}

func (h *Handler) DeleteBorrowingRepayment(ctx context.Context, req *financev1.DeleteBorrowingRepaymentRequest) (*emptypb.Empty, error) {
	bID, err := finance.ParseBorrowingID(req.GetBorrowingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	rID, err := finance.ParseBorrowingRepaymentID(req.GetId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	err = h.Coordinator.DeleteBorrowingRepayment(ctx, &financeapp.DeleteBorrowingRepaymentRequest{
		BorrowingID: bID,
		ID:          rID,
	})
	if err != nil {
		return nil, h.mapError(err)
	}

	return &emptypb.Empty{}, nil
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
		CreateTime:          timestamppb.New(b.CreateTime),
		UpdateTime:          timestamppb.New(b.UpdateTime),
		CreateAsTransaction: false,
	}
}

func toProtoBorrowingRepayment(r *finance.BorrowingRepayment) *financev1.BorrowingRepayment {
	if r == nil {
		return nil
	}

	var accountID string
	if r.AccountID != nil {
		accountID = string(*r.AccountID)
	}

	return &financev1.BorrowingRepayment{
		Id:          string(r.ID),
		BorrowingId: string(r.BorrowingID),
		SpaceId:     string(r.SpaceID),
		Amount:      r.Amount,
		PaymentDate: timestamppb.New(r.PaymentDate),
		Notes:       r.Notes,
		AccountId:   accountID,
		CreateTime:  timestamppb.New(r.CreateTime),
		UpdateTime:  timestamppb.New(r.UpdateTime),
	}
}
