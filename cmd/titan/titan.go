package main

import (
	"context"
	"fmt"
	"os"

	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/pkg/argon2id"
	"github.com/masterkeysrd/saturn/internal/pkg/console"
	"github.com/masterkeysrd/saturn/internal/pkg/uuid"
	"github.com/masterkeysrd/saturn/internal/storage/pg"
	identitypg "github.com/masterkeysrd/saturn/internal/storage/pg/identity"
	adminconsole "github.com/masterkeysrd/saturn/internal/transport/console/admin"
)

func init() {
	id.SetGenerator(uuid.NewGenerator())
}

func main() {
	db, err := pg.NewDefaultConnection()
	handleErr("failed to connect to database", err)
	defer db.Close()

	// wiring
	argonHasher := argon2id.New()

	// Storage initialization
	userStore, err := identitypg.NewUserStore(db)
	handleErr("failed to create user store", err)

	// Domain services initialization
	identityService := identity.NewService(identity.ServiceParams{
		UserStore:      userStore,
		PasswordHasher: argonHasher,
	})

	// Applications initialization
	identityApp := application.NewIdentity(application.IdentityParams{
		IdentityService: identityService,
	})

	mux := console.NewConsoleMux()

	// Register user commands
	userCommands := adminconsole.NewUserCommands(identityApp)
	userCommands.RegisterCommands(mux)

	mux.Run(context.Background())
}

func handleErr(msg string, err error) {
	if err != nil {
		fmt.Fprint(os.Stderr, msg+": ", err, "\n")
		os.Exit(1)
	}
}
