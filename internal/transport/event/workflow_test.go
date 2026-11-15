package event

import (
	"context"
	"testing"
	"time"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	eventmiddleware "github.com/masterkeysrd/saturn/internal/transport/event/middleware"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type stubWorkflowEventCoordinator struct {
	workflowapp.Coordinator
	dispatched []*workflowapp.DispatchEventTriggerRequest
	hopSeen    int
	chainSeen  []string
}

func (s *stubWorkflowEventCoordinator) DispatchEventTrigger(ctx context.Context, req *workflowapp.DispatchEventTriggerRequest) (*workflow.FlowRun, bool, error) {
	s.dispatched = append(s.dispatched, req)
	s.hopSeen = eventmiddleware.WorkflowHopFromContext(ctx)
	s.chainSeen = eventmiddleware.WorkflowChainFromContext(ctx)
	return &workflow.FlowRun{ID: "wfr_1"}, true, nil
}

type stubTriggerFinder struct {
	triggers []workflow.Trigger
}

func (s *stubTriggerFinder) FindEnabledEventTriggers(_ context.Context, _ string, _ string) ([]workflow.Trigger, error) {
	return s.triggers, nil
}

func TestProtoMessageToMap_PreservesInt64AndDefaults(t *testing.T) {
	txMsg := &financev1.TransactionCreatedEvent{
		Transaction: &financev1.Transaction{
			Id:              "txn_1",
			Amount:          2599,
			Currency:        "USD",
			Type:            financev1.Transaction_EXPENSE,
			TransactionDate: timestamppb.New(time.Date(2026, 4, 15, 0, 0, 0, 0, time.UTC)),
		},
	}
	m := protoMessageToMap(txMsg.ProtoReflect())
	tx := m["transaction"].(map[string]any)
	if tx["amount"] != int64(2599) || tx["type"] != "EXPENSE" || tx["transaction_date"] != "2026-04-15T00:00:00Z" {
		t.Fatalf("unexpected proto map: %+v", tx)
	}

	mailMsg := &mailv1.MessageReceivedEvent{
		Message: &mailv1.Message{
			Id:      "msg_1",
			Subject: "Receipt",
		},
	}
	mm := protoMessageToMap(mailMsg.ProtoReflect())["message"].(map[string]any)
	if mm["body_plain"] != "" || len(mm["attachments"].([]any)) != 0 {
		t.Fatalf("expected scalar/repeated defaults emitted, got %+v", mm)
	}
}

func TestWorkflowEventTriggerHandler_LoopGuardAndDispatch(t *testing.T) {
	payload, err := proto.Marshal(&mailv1.MessageReceivedEvent{
		Message: &mailv1.Message{Id: "msg_1", Subject: "Starbucks", BodyPlain: "Spent $10"},
	})
	if err != nil {
		t.Fatalf("proto.Marshal error = %v", err)
	}

	t.Run("DispatchesAndIncrementsHopAndChain", func(t *testing.T) {
		coord := &stubWorkflowEventCoordinator{}
		finder := &stubTriggerFinder{
			triggers: []workflow.Trigger{
				{ID: "trg_1", FlowID: "flw_inbox", Type: workflow.TriggerEvent, IsEnabled: true},
				{ID: "trg_cycle", FlowID: "flw_existing", Type: workflow.TriggerEvent, IsEnabled: true},
			},
		}
		handler := makeEventTriggerHandler(coord, finder, mailv1.TopicMessageReceivedEvent, func() proto.Message {
			return &mailv1.MessageReceivedEvent{}
		})

		ctx := auth.WithSpaceID(context.Background(), "spc_1")
		ctx = eventmiddleware.WithWorkflowChain(ctx, []string{"flw_existing"})
		ctx = eventmiddleware.WithWorkflowHop(ctx, 1)

		err := handler(ctx, eventbus.Message{
			ID:      "ebm_1",
			Topic:   mailv1.TopicMessageReceivedEvent,
			Payload: payload,
		})
		if err != nil {
			t.Fatalf("handler error = %v", err)
		}
		if len(coord.dispatched) != 1 || coord.dispatched[0].Trigger.ID != "trg_1" {
			t.Fatalf("expected only trg_1 dispatched (cycle skipped), got %+v", coord.dispatched)
		}
		if coord.hopSeen != 2 || len(coord.chainSeen) != 2 || coord.chainSeen[1] != "flw_inbox" {
			t.Fatalf("unexpected child context hop=%d chain=%v", coord.hopSeen, coord.chainSeen)
		}
	})

	t.Run("DropsEventWhenHopReachesLimit", func(t *testing.T) {
		coord := &stubWorkflowEventCoordinator{}
		finder := &stubTriggerFinder{
			triggers: []workflow.Trigger{{ID: "trg_1", FlowID: "flw_1", Type: workflow.TriggerEvent, IsEnabled: true}},
		}
		handler := makeEventTriggerHandler(coord, finder, mailv1.TopicMessageReceivedEvent, func() proto.Message {
			return &mailv1.MessageReceivedEvent{}
		})

		ctx := auth.WithSpaceID(context.Background(), "spc_1")
		ctx = eventmiddleware.WithWorkflowHop(ctx, eventmiddleware.MaxWorkflowHop)

		err := handler(ctx, eventbus.Message{ID: "ebm_2", Topic: mailv1.TopicMessageReceivedEvent, Payload: payload})
		if err != nil || len(coord.dispatched) != 0 {
			t.Fatalf("expected event dropped at max hop, dispatched=%d err=%v", len(coord.dispatched), err)
		}
	})
}
