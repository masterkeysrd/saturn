package console

// Option is a function that configures command options.
type Option func(*commandOptions)

type commandOptions struct {
	description string
	flags       []FlagSpec
}

// Description sets the description for a command.
func Description(desc string) Option {
	return func(opts *commandOptions) {
		opts.description = desc
	}
}

// Flag creates a new flag builder for the given flag name and description.
func Flag(name, description string) *FlagBuilder {
	return &FlagBuilder{
		name:        name,
		description: description,
	}
}
