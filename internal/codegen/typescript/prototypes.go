package typescriptgen

import "google.golang.org/protobuf/reflect/protoreflect"

const ProtoEmpty = "google.protobuf.Empty"

// IsProtoEmpty checks if the given descriptor corresponds to
// google.protobuf.Empty.
func IsProtoEmpty(desc protoreflect.Descriptor) bool {
	return desc.FullName() == ProtoEmpty
}
