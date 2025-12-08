package console

import "context"

// Request represents a command request with its name and arguments.
type Request struct {
	ctx     context.Context
	command string
	flags   Flags
}

func NewRequest(ctx context.Context, command string, flags Flags) *Request {
	return &Request{
		ctx:     ctx,
		command: command,
		flags:   flags,
	}
}

// Context returns the request context.
func (r *Request) Context() context.Context {
	return r.ctx
}

func (r *Request) WithContext(ctx context.Context) *Request {
	return &Request{
		ctx:     ctx,
		command: r.command,
		flags:   r.flags,
	}
}

// Command returns the command name.
func (r *Request) Command() string {
	return r.command
}

// Flags returns the parsed flags for the request.
func (r *Request) Flags() Flags {
	return r.flags
}
