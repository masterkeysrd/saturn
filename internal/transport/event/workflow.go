package event

import (
	"context"
	"encoding/json/v2"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"time"

	calendarv1 "github.com/masterkeysrd/saturn/apis/saturn/calendar/v1"
	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	mailv1 "github.com/masterkeysrd/saturn/apis/saturn/mail/v1"
	workflowapp "github.com/masterkeysrd/saturn/internal/application/workflow"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
	eventmiddleware "github.com/masterkeysrd/saturn/internal/transport/event/middleware"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	// TopicWorkflowRunDispatch is the internal eventbus topic used to execute queued FlowRuns asynchronously.
	TopicWorkflowRunDispatch = "platform.workflow.run.dispatch"

	workflowDispatchSubscriberID = "platform.workflow.run_dispatcher"
)

// WorkflowRunDispatchMessage carries the coordinates needed to resume an async FlowRun.
type WorkflowRunDispatchMessage struct {
	SpaceID   string `json:"space_id"`
	FlowRunID string `json:"flow_run_id"`
}

// EventBusRunDispatcher implements workflowapp.RunDispatcher over eventbus.Engine.
type EventBusRunDispatcher struct {
	engine *eventbus.Engine
}

// NewEventBusRunDispatcher creates an EventBusRunDispatcher backed by engine.
func NewEventBusRunDispatcher(engine *eventbus.Engine) *EventBusRunDispatcher {
	return &EventBusRunDispatcher{engine: engine}
}

// Dispatch publishes a WorkflowRunDispatchMessage inside the caller's active transaction/context.
func (d *EventBusRunDispatcher) Dispatch(ctx context.Context, spaceID string, flowRunID string) error {
	payload, err := json.Marshal(WorkflowRunDispatchMessage{
		SpaceID:   spaceID,
		FlowRunID: flowRunID,
	})
	if err != nil {
		return fmt.Errorf("marshal workflow dispatch payload: %w", err)
	}
	return d.engine.Publish(ctx, TopicWorkflowRunDispatch, payload)
}

// WorkflowTriggerFinder queries enabled event triggers for a space and topic.
type WorkflowTriggerFinder interface {
	FindEnabledEventTriggers(ctx context.Context, spaceID string, topic string) ([]workflow.Trigger, error)
}

// RegisterWorkflowSubscribers wires both async FlowRun execution and domain-event trigger matching onto engine.
func RegisterWorkflowSubscribers(
	engine *eventbus.Engine,
	coord workflowapp.Coordinator,
	triggers WorkflowTriggerFinder,
	catalog workflow.Catalog,
) {
	engine.Subscribe(TopicWorkflowRunDispatch, workflowDispatchSubscriberID, func(ctx context.Context, msg eventbus.Message) error {
		var payload WorkflowRunDispatchMessage
		if err := json.Unmarshal(msg.Payload, &payload); err != nil {
			return fmt.Errorf("unmarshal workflow run dispatch payload: %w", err)
		}
		if payload.SpaceID == "" {
			payload.SpaceID, _ = auth.SpaceIDFromContext(ctx)
		}
		ctx = auth.WithSpaceID(ctx, payload.SpaceID)
		_, err := coord.ExecuteFlowRun(ctx, payload.SpaceID, payload.FlowRunID)
		return err
	})

	factories := defaultTopicProtoFactories()
	for _, topicDesc := range catalog.TriggerTopics {
		topic := topicDesc.Topic
		factory, ok := factories[topic]
		if !ok {
			continue
		}
		subID := "platform.workflow.trigger." + topic
		engine.Subscribe(topic, subID, makeEventTriggerHandler(coord, triggers, topic, factory))
	}
}

func makeEventTriggerHandler(
	coord workflowapp.Coordinator,
	triggers WorkflowTriggerFinder,
	topic string,
	newProto func() proto.Message,
) eventbus.Handler {
	return func(ctx context.Context, msg eventbus.Message) error {
		hop := eventmiddleware.WorkflowHopFromContext(ctx)
		if hop >= eventmiddleware.MaxWorkflowHop {
			return nil
		}

		spaceID, ok := auth.SpaceIDFromContext(ctx)
		if !ok || strings.TrimSpace(spaceID) == "" {
			return fmt.Errorf("event %q (%s) missing space_id context header", msg.Topic, msg.ID)
		}

		pb := newProto()
		if err := proto.Unmarshal(msg.Payload, pb); err != nil {
			return fmt.Errorf("unmarshal %s proto: %w", topic, err)
		}
		triggerData := protoMessageToMap(pb.ProtoReflect())

		matched, err := triggers.FindEnabledEventTriggers(ctx, spaceID, topic)
		if err != nil {
			return err
		}
		if len(matched) == 0 {
			return nil
		}

		chain := eventmiddleware.WorkflowChainFromContext(ctx)
		for i := range matched {
			trig := matched[i]
			if slices.Contains(chain, trig.FlowID) {
				continue
			}

			nextChain := append(slices.Clone(chain), trig.FlowID)
			nextHop := hop + 1
			childCtx := eventmiddleware.WithWorkflowChain(ctx, nextChain)
			childCtx = eventmiddleware.WithWorkflowHop(childCtx, nextHop)

			if _, _, err := coord.DispatchEventTrigger(childCtx, &workflowapp.DispatchEventTriggerRequest{
				SpaceID:        spaceID,
				Trigger:        &trig,
				TriggerData:    triggerData,
				IdempotencyKey: fmt.Sprintf("evt:%s:%s", msg.ID, trig.ID),
				Metadata: map[string]any{
					"event_message_id":                  msg.ID,
					eventmiddleware.HeaderWorkflowChain: strings.Join(nextChain, ","),
					eventmiddleware.HeaderWorkflowHop:   strconv.Itoa(nextHop),
				},
			}); err != nil {
				return err
			}
		}
		return nil
	}
}

func defaultTopicProtoFactories() map[string]func() proto.Message {
	return map[string]func() proto.Message{
		mailv1.TopicMessageReceivedEvent:                func() proto.Message { return &mailv1.MessageReceivedEvent{} },
		calendarv1.TopicCalendarEventCreatedEvent:       func() proto.Message { return &calendarv1.CalendarEventCreatedEvent{} },
		calendarv1.TopicCalendarEventUpdatedEvent:       func() proto.Message { return &calendarv1.CalendarEventUpdatedEvent{} },
		financev1.TopicScheduledTransactionCreatedEvent: func() proto.Message { return &financev1.ScheduledTransactionCreatedEvent{} },
		financev1.TopicScheduledTransactionUpdatedEvent: func() proto.Message { return &financev1.ScheduledTransactionUpdatedEvent{} },
		financev1.TopicScheduledTransactionPaidEvent:    func() proto.Message { return &financev1.ScheduledTransactionPaidEvent{} },
		financev1.TopicInboxItemCreatedEvent:            func() proto.Message { return &financev1.InboxItemCreatedEvent{} },
		financev1.TopicInboxItemApprovedEvent:           func() proto.Message { return &financev1.InboxItemApprovedEvent{} },
		financev1.TopicTransactionCreatedEvent:          func() proto.Message { return &financev1.TransactionCreatedEvent{} },
	}
}

func protoMessageToMap(msg protoreflect.Message) map[string]any {
	if !msg.IsValid() {
		return map[string]any{}
	}
	if ts, ok := msg.Interface().(*timestamppb.Timestamp); ok && ts != nil {
		return map[string]any{}
	}

	fields := msg.Descriptor().Fields()
	out := make(map[string]any, fields.Len())
	for i := 0; i < fields.Len(); i++ {
		fd := fields.Get(i)
		key := string(fd.Name())
		val := msg.Get(fd)

		if fd.IsMap() {
			m := val.Map()
			mapOut := make(map[string]any, m.Len())
			m.Range(func(k protoreflect.MapKey, v protoreflect.Value) bool {
				mapOut[fmt.Sprint(k.Interface())] = protoSingularToGo(fd.MapValue(), v)
				return true
			})
			out[key] = mapOut
			continue
		}

		if fd.IsList() {
			list := val.List()
			arr := make([]any, 0, list.Len())
			for j := 0; j < list.Len(); j++ {
				arr = append(arr, protoSingularToGo(fd, list.Get(j)))
			}
			out[key] = arr
			continue
		}

		if fd.HasPresence() && !msg.Has(fd) {
			if fd.Kind() == protoreflect.MessageKind {
				continue
			}
		}

		out[key] = protoSingularToGo(fd, val)
	}
	return out
}

func protoSingularToGo(fd protoreflect.FieldDescriptor, v protoreflect.Value) any {
	switch fd.Kind() {
	case protoreflect.BoolKind:
		return v.Bool()
	case protoreflect.Int32Kind, protoreflect.Sint32Kind, protoreflect.Sfixed32Kind,
		protoreflect.Int64Kind, protoreflect.Sint64Kind, protoreflect.Sfixed64Kind:
		return v.Int()
	case protoreflect.Uint32Kind, protoreflect.Fixed32Kind,
		protoreflect.Uint64Kind, protoreflect.Fixed64Kind:
		return int64(v.Uint())
	case protoreflect.FloatKind, protoreflect.DoubleKind:
		return v.Float()
	case protoreflect.StringKind:
		return v.String()
	case protoreflect.BytesKind:
		return v.Bytes()
	case protoreflect.EnumKind:
		if ev := fd.Enum().Values().ByNumber(v.Enum()); ev != nil {
			return string(ev.Name())
		}
		return int64(v.Enum())
	case protoreflect.MessageKind, protoreflect.GroupKind:
		sub := v.Message()
		if !sub.IsValid() {
			return nil
		}
		if sub.Descriptor().FullName() == "google.protobuf.Timestamp" {
			if ts, ok := sub.Interface().(*timestamppb.Timestamp); ok && ts != nil {
				return ts.AsTime().UTC().Format(time.RFC3339)
			}
		}
		return protoMessageToMap(sub)
	default:
		return v.Interface()
	}
}
