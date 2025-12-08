package console

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

// Handler handles a command request.
type Handler interface {
	Handle(CommandWriter, *Request) error
}

// HandlerFunc allows using a function as a Handler.
type HandlerFunc func(CommandWriter, *Request) error

func (hf HandlerFunc) Handle(w CommandWriter, r *Request) error {
	return hf(w, r)
}

// Registrar defines how to register commands.
// It returns a Registrar to allow registering subcommands.
type Registrar interface {
	// Register adds a command with the given handler and options.
	Register(command string, handler Handler, options ...Option) Registrar
}

// ConsoleMux is the router for CLI commands.
type ConsoleMux struct {
	commands map[string]commandEntry
}

func NewConsoleMux() *ConsoleMux {
	return &ConsoleMux{
		commands: make(map[string]commandEntry),
	}
}

// Register adds a command to the mux.
// It returns a Registrar that is scoped to this command, allowing subcommands.
func (cm *ConsoleMux) Register(command string, handler Handler, options ...Option) Registrar {
	var opts commandOptions
	for _, opt := range options {
		opt(&opts)
	}

	cm.commands[command] = commandEntry{
		options: opts,
		handler: handler,
	}

	// Return a group scoped to this command prefix
	return &commandGroup{
		mux:    cm,
		prefix: command,
	}
}

// commandGroup implements Registrar for subcommands.
type commandGroup struct {
	mux    *ConsoleMux
	prefix string
}

func (cg *commandGroup) Register(command string, handler Handler, options ...Option) Registrar {
	fullCommand := command
	if cg.prefix != "" {
		fullCommand = cg.prefix + " " + command
	}
	// Delegate back to the main mux with the full path
	return cg.mux.Register(fullCommand, handler, options...)
}

// Run executes the CLI.
func (cm *ConsoleMux) Run(ctx context.Context) {
	appName := filepath.Base(os.Args[0])

	// Helper to print errors in the requested format
	printErr := func(format string, a ...any) {
		fmt.Fprintf(os.Stderr, "%s: [ERROR]: ", appName)
		fmt.Fprintf(os.Stderr, format+"\n\n", a...)
		cm.printGlobalUsage(appName)
		os.Exit(1)
	}

	// 1. Basic Validation
	if len(os.Args) < 2 {
		printErr("No command provided.")
	}

	rawArgs := os.Args[1:]

	// 2. Check for Help Request
	isHelpCommand := false
	matchArgs := rawArgs
	if len(rawArgs) > 0 && rawArgs[len(rawArgs)-1] == "help" {
		isHelpCommand = true
		// Remove "help" to find the target command context
		matchArgs = rawArgs[:len(rawArgs)-1]
	}

	// If asking for "titan help" (root help)
	if isHelpCommand && len(matchArgs) == 0 {
		cm.printRootHelp(appName)
		os.Exit(0)
	}

	// 3. Find Best Matching Command
	matchedCmd, matchedEntry, argsAfterCmd := cm.findMatch(matchArgs)

	// 4. Handle Help Logic
	if isHelpCommand {
		if matchedCmd == "" {
			cm.printRootHelp(appName)
		} else {
			cm.printCommandHelp(appName, matchedCmd, matchedEntry)
		}
		os.Exit(0)
	}

	// 5. Handle Execution Logic
	if matchedCmd == "" {
		printErr("unknown command: %s", rawArgs[0])
	}

	// Ensure the command actually has a handler
	if matchedEntry.handler == nil {
		printErr("command '%s' requires a subcommand", matchedCmd)
	}

	// 6. Parse Flags
	flagSet := flag.NewFlagSet(matchedCmd, flag.ContinueOnError)
	// Silence default usage to handle it manually
	flagSet.Usage = func() {}

	parsedFlags := make(Flags)
	for _, fspec := range matchedEntry.options.flags {
		var value any
		switch fspec.Kind {
		case FlagKindString:
			var s string
			flagSet.StringVar(&s, fspec.Name, "", fspec.Description)
			value = &s
		case FlagKindInt:
			var i int
			flagSet.IntVar(&i, fspec.Name, 0, fspec.Description)
			value = &i
		case FlagKindBool:
			var b bool
			flagSet.BoolVar(&b, fspec.Name, false, fspec.Description)
			value = &b
		}
		parsedFlags[fspec.Name] = FlagVal{spec: fspec, value: value}
	}

	if err := flagSet.Parse(argsAfterCmd); err != nil {
		// printErr exits, so we format the message first
		printErr("Error parsing flags for command %s: %v", matchedCmd, err)
	}

	// 7. Validate Required Flags
	for _, fspec := range matchedEntry.options.flags {
		if fspec.Required {
			isSet := false
			flagSet.Visit(func(f *flag.Flag) {
				if f.Name == fspec.Name {
					isSet = true
				}
			})
			if !isSet {
				fmt.Fprintf(os.Stderr, "%s: [ERROR]: Missing required flag --%s\n\n", appName, fspec.Name)
				cm.printCommandHelp(appName, matchedCmd, matchedEntry)
				os.Exit(1)
			}
		}
	}

	// 8. Dispatch
	req := NewRequest(ctx, matchedCmd, parsedFlags)
	writer := &ConsoleResponseWriter{
		out: os.Stdout,
		err: os.Stderr,
	}

	if err := matchedEntry.handler.Handle(writer, req); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

// findMatch implements Longest Prefix Match
func (cm *ConsoleMux) findMatch(args []string) (name string, entry commandEntry, remaining []string) {
	for cmdName, ent := range cm.commands {
		cmdParts := strings.Split(cmdName, " ")

		if len(args) < len(cmdParts) {
			continue
		}

		match := true
		for i, part := range cmdParts {
			if args[i] != part {
				match = false
				break
			}
		}

		if match {
			if len(cmdName) > len(name) {
				name = cmdName
				entry = ent
				remaining = args[len(cmdParts):]
			}
		}
	}
	return
}

var titleCaser = cases.Title(language.English)

func (cm *ConsoleMux) printRootHelp(appName string) {
	fmt.Printf("%s - Command Line Interface\n\n", titleCaser.String(appName))
	cm.printGlobalUsage(appName)
	fmt.Println("\nAvailable Commands:")

	// Get sorted list of top-level commands
	var roots []string
	seen := make(map[string]bool)

	for cmd := range cm.commands {
		root := strings.Split(cmd, " ")[0]
		if !seen[root] {
			roots = append(roots, root)
			seen[root] = true
		}
	}
	sort.Strings(roots)

	for _, root := range roots {
		// Try to find description if root is a registered command itself
		desc := ""
		if entry, ok := cm.commands[root]; ok {
			desc = entry.options.description
		}
		fmt.Printf("  %-15s %s\n", root, desc)
	}
	fmt.Println()
}

func (cm *ConsoleMux) printCommandHelp(appName, cmdName string, entry commandEntry) {
	desc := entry.options.description
	if desc == "" {
		desc = "No description provided."
	}

	fmt.Printf("Command: %s %s\n", appName, cmdName)
	fmt.Printf("Description: %s\n\n", desc)

	// List Flags
	if len(entry.options.flags) > 0 {
		fmt.Println("Flags:")
		for _, f := range entry.options.flags {
			req := ""
			if f.Required {
				req = "(Required)"
			}
			fmt.Printf("  -%-15s %s %s\n", f.Name, f.Description, req)
		}
		fmt.Println()
	}

	// List Subcommands (if any exist for this prefix)
	var subcmds []string
	prefix := cmdName + " "
	for name := range cm.commands {
		if rel, ok := strings.CutPrefix(name, prefix); ok {
			if !strings.Contains(rel, " ") {
				subcmds = append(subcmds, rel)
			}
		}
	}

	if len(subcmds) > 0 {
		sort.Strings(subcmds)
		fmt.Println("Subcommands:")
		for _, sub := range subcmds {
			subKey := prefix + sub
			subDesc := cm.commands[subKey].options.description
			fmt.Printf("  %-15s %s\n", sub, subDesc)
		}
		fmt.Println()
	}
}

func (cm *ConsoleMux) printGlobalUsage(appName string) {
	fmt.Fprintf(os.Stderr, "usage: %s <command> [<subcommand>] [flags]\n", appName)
	fmt.Fprintf(os.Stderr, "To see help text, run:\n\n")
	fmt.Fprintf(os.Stderr, "%s help\n", appName)
	fmt.Fprintf(os.Stderr, "%s <command> help\n", appName)
	fmt.Fprintf(os.Stderr, "%s <command> <subcommand> help\n", appName)
}

type commandEntry struct {
	options commandOptions
	handler Handler
}
