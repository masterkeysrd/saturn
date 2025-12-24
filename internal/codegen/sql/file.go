package sqlgen

import (
	"bytes"
	"fmt"
)

type File struct {
	buf bytes.Buffer
}

func NewFile(buf bytes.Buffer) *File {
	return &File{
		buf: buf,
	}
}

func (f *File) P(args ...any) {
	for _, arg := range args {
		fmt.Fprint(&f.buf, arg)
	}
	fmt.Fprint(&f.buf, "\n")
}

func (f *File) String() string {
	return f.buf.String()
}

func (f *File) Bytes() []byte {
	return f.buf.Bytes()
}
