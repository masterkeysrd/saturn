package eventbus

import (
	"context"
	"errors"
	"testing"

	"google.golang.org/protobuf/types/known/emptypb"
)

type sampleDomainEvent struct {
	ID string
}

func TestConverterRegistryAndEdgePublisher(t *testing.T) {
	reg := NewConverterRegistry()
	reg.Register("sample.created", func(ev sampleDomainEvent) (*emptypb.Empty, error) {
		if ev.ID == "" {
			return nil, errors.New("missing id")
		}
		return &emptypb.Empty{}, nil
	})

	t.Run("Convert valid event", func(t *testing.T) {
		msg, err := reg.Convert(t.Context(), "sample.created", sampleDomainEvent{ID: "123"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if _, ok := msg.(*emptypb.Empty); !ok {
			t.Fatalf("expected *emptypb.Empty, got %T", msg)
		}
	})

	t.Run("Convert mismatched event type returns error", func(t *testing.T) {
		if _, err := reg.Convert(t.Context(), "sample.created", "wrong-type"); err == nil {
			t.Fatal("expected error for type mismatch, got nil")
		}
	})

	t.Run("Convert unregistered topic returns error", func(t *testing.T) {
		if _, err := reg.Convert(t.Context(), "missing.topic", sampleDomainEvent{ID: "1"}); err == nil {
			t.Fatal("expected error for unregistered topic, got nil")
		}
	})

	t.Run("Nil EdgePublisher is safe noop", func(t *testing.T) {
		var p *EdgePublisher
		if err := p.Publish(context.Background(), "sample.created", sampleDomainEvent{ID: "1"}); err != nil {
			t.Fatalf("expected nil error on nil publisher, got %v", err)
		}
	})
}
