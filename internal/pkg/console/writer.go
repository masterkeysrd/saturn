package console

import (
	"fmt"
	"io"
)

// CommandWriter is an interface that wraps the basic Write method
// for writing command output.
type CommandWriter interface {
	Println(a ...any) (n int, err error)
	Printf(format string, a ...any) (n int, err error)
	Errorf(format string, a ...any) (n int, err error)
	Errorln(a ...any) (n int, err error)
	Write(b []byte) (n int, err error)
}

type ConsoleResponseWriter struct {
	out io.Writer
	err io.Writer
}

func NewConsoleWriter(out, err io.Writer) *ConsoleResponseWriter {
	return &ConsoleResponseWriter{
		out: out,
		err: err,
	}
}

func (cw *ConsoleResponseWriter) Println(a ...any) (n int, err error) {
	return fmt.Fprintln(cw.out, a...)
}

func (cw *ConsoleResponseWriter) Printf(format string, a ...any) (n int, err error) {
	return fmt.Fprintf(cw.out, format, a...)
}

func (cw *ConsoleResponseWriter) Errorf(format string, a ...any) (n int, err error) {
	return fmt.Fprintf(cw.err, format, a...)
}

func (cw *ConsoleResponseWriter) Errorln(a ...any) (n int, err error) {
	return fmt.Fprintln(cw.err, a...)
}

func (cw *ConsoleResponseWriter) Write(b []byte) (n int, err error) {
	return cw.out.Write(b)
}
