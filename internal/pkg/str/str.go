package str

import "strings"

const maxInt = int(^uint(0) >> 1)

func Join[Str ~string](elems []Str, sep string) string {
	switch len(elems) {
	case 0:
		return ""
	case 1:
		return string(elems[0])
	}

	var n int
	if len(sep) > 0 {
		if len(sep) >= maxInt/(len(elems)-1) {
			panic("strings: Join output length overflow")
		}
		n += len(sep) * (len(elems) - 1)
	}
	for _, elem := range elems {
		if len(elem) > maxInt-n {
			panic("strings: Join output length overflow")
		}
		n += len(elem)
	}

	var b strings.Builder
	b.Grow(n)
	b.WriteString(string(elems[0]))
	for _, s := range elems[1:] {
		b.WriteString(sep)
		b.WriteString(string(s))
	}
	return b.String()
}

// Split divides str into substrings separated by sep.
// Uses generics to allow custom string types as return values.
func Split[Str ~string](str string, sep string) []Str {
	parts := strings.Split(str, sep)
	result := make([]Str, len(parts))
	for i, part := range parts {
		result[i] = Str(part)
	}
	return result
}
