package eventbus_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/eventbus"
)

// TestEventBus_CompileVerify verifies structural API definitions.
func TestEventBus_CompileVerify(t *testing.T) {
	var _ = (*eventbus.Engine)(nil)
}
