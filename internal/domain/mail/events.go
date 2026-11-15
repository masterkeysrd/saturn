package mail

// TopicMessageReceived is the eventbus topic emitted when an inbound message is synced on delta sync.
const TopicMessageReceived = "mail.message.received"

// MessageReceivedEvent represents a newly synced inbound email message emitted as a domain event.
type MessageReceivedEvent struct {
	Message   *Message
	BodyPlain string
	BodyHTML  string
}
