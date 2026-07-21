package finance

import (
	"context"
	"time"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func (h *Handler) CreateBorrowing(ctx context.Context, req *financev1.CreateBorrowingRequest) (*financev1.Borrowing, error) {
	input := req.GetBorrowing()
	if input == nil {
		return nil, status.Error(codes.InvalidArgument, "missing borrowing input")
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

	b, err := h.Coordinator.GetBorrowing(ctx, bID)
	if err != nil {
		return nil, h.mapError(err)
	}

	return toProtoBorrowing(b), nil
}

func (h *Handler) ListBorrowings(ctx context.Context, req *financev1.ListBorrowingsRequest) (*financev1.ListBorrowingsResponse, error) {
	var statusFilter *string
	if req.Status != nil && *req.Status != financev1.BorrowingStatus_BORROWING_STATUS_UNSPECIFIED {
		sStr := req.Status.String()
		// Convert proto enum string representation (e.g. BORROWING_STATUS_ACTIVE) to ACTIVE/PAID_OFF
		if *req.Status == financev1.BorrowingStatus_BORROWING_STATUS_ACTIVE {
			sStr = "ACTIVE"
		} else if *req.Status == financev1.BorrowingStatus_BORROWING_STATUS_PAID_OFF {
			sStr = "PAID_OFF"
		}
		statusFilter = &sStr
	}

	var directionFilter *string
	if req.Direction != nil && *req.Direction != financev1.BorrowingDirection_BORROWING_DIRECTION_UNSPECIFIED {
		dStr := req.Direction.String()
		if *req.Direction == financev1.BorrowingDirection_BORROWING_DIRECTION_BORROWED {
			dStr = "BORROWED"
		} else if *req.Direction == financev1.BorrowingDirection_BORROWING_DIRECTION_LENT {
			dStr = "LENT"
		}
		directionFilter = &dStr
	}

	appReq := &financeapp.ListBorrowingsRequest{
		Status:        statusFilter,
		Direction:     directionFilter,
		PageSize:      req.GetPageSize(),
		NextPageToken: req.GetPageToken(),
	}

	list, nextToken, err := h.Coordinator.ListBorrowings(ctx, appReq)
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
		return nil, status.Error(codes.InvalidArgument, "missing borrowing input")
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
		return nil, status.Error(codes.InvalidArgument, "missing repayment input")
	}

	var paymentDate time.Time
	if input.GetPaymentDate() != nil {
		paymentDate = input.GetPaymentDate().AsTime()
	} else {
		paymentDate = time.Now().UTC()
	}

	bID, err := finance.ParseBorrowingID(req.GetBorrowingId())
	if err != nil {
		return nil, status.Error(codes.InvalidArgument, err.Error())
	}

	appReq := &financeapp.CreateBorrowingRepaymentRequest{
		BorrowingID: bID,
		Amount:      input.GetAmount(),
		PaymentDate: paymentDate,
		Notes:       input.GetNotes(),
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

	list, err := h.Coordinator.ListBorrowingRepayments(ctx, bID)
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
func toDomainBorrowingDirection(d financev1.BorrowingDirection) string {
	switch d {
	case financev1.BorrowingDirection_BORROWING_DIRECTION_BORROWED:
		return string(finance.BorrowingDirectionBorrowed)
	case financev1.BorrowingDirection_BORROWING_DIRECTION_LENT:
		return string(finance.BorrowingDirectionLent)
	default:
		return ""
	}
}

func toProtoBorrowingDirection(d finance.BorrowingDirection) financev1.BorrowingDirection {
	switch d {
	case finance.BorrowingDirectionBorrowed:
		return financev1.BorrowingDirection_BORROWING_DIRECTION_BORROWED
	case finance.BorrowingDirectionLent:
		return financev1.BorrowingDirection_BORROWING_DIRECTION_LENT
	default:
		return financev1.BorrowingDirection_BORROWING_DIRECTION_UNSPECIFIED
	}
}

func toProtoBorrowingStatus(s finance.BorrowingStatus) financev1.BorrowingStatus {
	switch s {
	case finance.BorrowingStatusActive:
		return financev1.BorrowingStatus_BORROWING_STATUS_ACTIVE
	case finance.BorrowingStatusPaidOff:
		return financev1.BorrowingStatus_BORROWING_STATUS_PAID_OFF
	default:
		return financev1.BorrowingStatus_BORROWING_STATUS_UNSPECIFIED
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

	return &financev1.BorrowingRepayment{
		Id:          string(r.ID),
		BorrowingId: string(r.BorrowingID),
		SpaceId:     string(r.SpaceID),
		Amount:      r.Amount,
		PaymentDate: timestamppb.New(r.PaymentDate),
		Notes:       r.Notes,
		CreateTime:  timestamppb.New(r.CreateTime),
		UpdateTime:  timestamppb.New(r.UpdateTime),
	}
}
