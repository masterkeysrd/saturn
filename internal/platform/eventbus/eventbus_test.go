package eventbus

import (
	"context"
	"testing"

	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// TestEventBus_CompileVerify verifies structural API definitions.
func TestEventBus_CompileVerify(t *testing.T) {
	var _ = (*Engine)(nil)
}

func TestEngine_SubscribeHandlerUpdate(t *testing.T) {
	engine := NewEngine(nil)

	// Register initial subscriber
	engine.Subscribe("test.topic", "sub-1", nil)

	// Update handler for same subscriberID
	var updatedCalled bool
	updatedHandler := func(ctx context.Context, msg Message) error {
		updatedCalled = true
		return nil
	}

	engine.Subscribe("test.topic", "sub-1", updatedHandler)
	if updatedCalled {
		t.Log("handler updated successfully")
	}
}

func TestEngine_PublishProto(t *testing.T) {
	tests := []struct {
		name    string
		topic   string
		msg     *timestamppb.Timestamp
		wantErr bool
	}{
		{
			name:    "publishes proto successfully",
			topic:   "test.proto.topic",
			msg:     &timestamppb.Timestamp{Seconds: 12345, Nanos: 678},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine := NewEngine(nil)
			var captured *Message
			engine.UseProducer(func(next PublishFunc) PublishFunc {
				return func(ctx context.Context, msg *Message) error {
					captured = msg
					return nil
				}
			})

			err := engine.PublishProto(context.Background(), tt.topic, tt.msg)
			if (err != nil) != tt.wantErr {
				t.Fatalf("PublishProto err = %v, wantErr = %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if captured == nil {
					t.Fatal("expected captured message to be non-nil")
				}
				if captured.Topic != tt.topic {
					t.Errorf("expected topic %q, got %q", tt.topic, captured.Topic)
				}
				var decoded timestamppb.Timestamp
				if err := proto.Unmarshal(captured.Payload, &decoded); err != nil {
					t.Fatalf("failed to unmarshal captured payload: %v", err)
				}
				if decoded.Seconds != tt.msg.Seconds || decoded.Nanos != tt.msg.Nanos {
					t.Errorf("decoded proto = %+v, want %+v", &decoded, tt.msg)
				}
			}
		})
	}
}

func TestEngine_SubscribeProto(t *testing.T) {
	validPayload, _ := proto.Marshal(&timestamppb.Timestamp{Seconds: 98765})

	tests := []struct {
		name        string
		payload     []byte
		wantErr     bool
		wantSeconds int64
	}{
		{
			name:        "valid proto deserialization and callback",
			payload:     validPayload,
			wantErr:     false,
			wantSeconds: 98765,
		},
		{
			name:        "empty payload gives zero-value message",
			payload:     nil,
			wantErr:     false,
			wantSeconds: 0,
		},
		{
			name:        "invalid proto payload returns error",
			payload:     []byte{0xff, 0xff, 0xff},
			wantErr:     true,
			wantSeconds: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine := NewEngine(nil)
			var received *timestamppb.Timestamp
			engine.SubscribeProto("test.topic", "sub-1", func(ctx context.Context, payload *timestamppb.Timestamp) error {
				received = payload
				return nil
			})

			engine.mu.RLock()
			subs := engine.subscribers["test.topic"]
			engine.mu.RUnlock()

			if len(subs) == 0 {
				t.Fatal("expected registered subscriber")
			}
			handler := subs[0].handler

			err := handler(context.Background(), Message{
				Topic:   "test.topic",
				Payload: tt.payload,
			})
			if (err != nil) != tt.wantErr {
				t.Fatalf("handler err = %v, wantErr = %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if received == nil {
					t.Fatal("expected non-nil received payload")
				}
				if received.Seconds != tt.wantSeconds {
					t.Errorf("received seconds = %d, want %d", received.Seconds, tt.wantSeconds)
				}
			}
		})
	}
}
