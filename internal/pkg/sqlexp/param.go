package sqlexp

import "strings"

func NamedParam(name string) string {
	return ":" + name
}

func Func(name string, args ...string) string {
	return name + "(" + strings.Join(args, ", ") + ")"
}
