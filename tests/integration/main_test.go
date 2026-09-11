//go:build integration

package integration_test

import (
	"log"
	"os"
	"testing"

	"github.com/masterkeysrd/saturn/tests/driver"
)

var testEnv *driver.TestEnv

func TestMain(m *testing.M) {
	var err error
	testEnv, err = driver.StartTestEnv()
	if err != nil {
		log.Fatalf("failed to start integration subsystem test environment: %v", err)
	}
	defer testEnv.Stop()

	os.Exit(m.Run())
}
