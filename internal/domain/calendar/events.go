package calendar

const (
	// TopicEventCreated is the eventbus topic emitted when a calendar event is created.
	TopicEventCreated = "calendar.event.created"
	// TopicEventUpdated is the eventbus topic emitted when a calendar event is updated.
	TopicEventUpdated = "calendar.event.updated"
)

// EventCreatedEvent represents a newly created calendar event.
type EventCreatedEvent struct {
	Event *Event
}

// EventUpdatedEvent represents an updated calendar event.
type EventUpdatedEvent struct {
	Event *Event
}
