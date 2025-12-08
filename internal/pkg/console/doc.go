/*
Package console provides a fluent and robust framework for building command-line interfaces (CLIs) in Go.

It is designed to be used as an internal library (pkg) within modular monoliths or microservices,
offering a declarative API for registering commands, flags, and handlers.

Key Features

  - Hierarchical Commands: Support for nested subcommands (e.g., "user create", "db migrate").
  - Fluent Builder API: Register commands and flags using a readable chainable syntax.
  - Type-Safe Flags: Strongly typed flags (String, Int, Bool) with built-in validation.
  - Automatic Help: Generates standardized help text and usage instructions.
  - Context Aware: Propagates context to handlers for timeout and cancellation control.
  - Testable: Output is directed to an interface (CommandWriter), allowing easy testing assertion.

# Usage

Initialize the Mux and register commands in your main.go or application wiring:

	mux := console.NewConsoleMux()

	// Register a simple command
	mux.Register("greet", greetHandler,
		console.Description("Prints a greeting"),
		console.Flag("name", "Who to greet").Required().String(),
	)

	// Run the CLI
	mux.Run(context.Background())

# Handler Implementation

Handlers implement the Handler interface or use the HandlerFunc adapter:

	func greetHandler(w console.CommandWriter, r *console.Request) {
		name := r.Flags().Get("name").String()
		w.Printf("Hello, %s!\n", name)
	}
*/
package console
