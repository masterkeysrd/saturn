package middleware

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
)

func TestWorkflowChainMiddleware(t *testing.T) {
	ctx := WithWorkflowChain(context.Background(), []string{"flw_1", "flw_2"})
	ctx = WithWorkflowHop(ctx, 2)

	var published *eventbus.Message
	prod := WorkflowChainProducer()(func(_ context.Context, msg *eventbus.Message) error {
		published = msg
		return nil
	})
	if err := prod(ctx, &eventbus.Message{Topic: "finance.inbox_item.created"}); err != nil {
		t.Fatalf("producer error = %v", err)
	}
	if published.Headers[HeaderWorkflowChain] != "flw_1,flw_2" || published.Headers[HeaderWorkflowHop] != "2" {
		t.Fatalf("unexpected headers: %+v", published.Headers)
	}

	var gotChain []string
	var gotHop int
	cons := WorkflowChainConsumer()(func(c context.Context, _ eventbus.Message) error {
		gotChain = WorkflowChainFromContext(c)
		gotHop = WorkflowHopFromContext(c)
		return nil
	})
	if err := cons(context.Background(), *published); err != nil {
		t.Fatalf("consumer error = %v", err)
	}
	if len(gotChain) != 2 || gotChain[0] != "flw_1" || gotChain[1] != "flw_2" || gotHop != 2 {
		t.Fatalf("unexpected unpacked context: chain=%v hop=%d", gotChain, gotHop)
	}
}
