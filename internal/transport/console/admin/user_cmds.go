package adminconsole

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/pkg/console"
)

type UserCommands struct {
	identityApp IdentityApplication
}

func NewUserCommands(identityApp IdentityApplication) *UserCommands {
	return &UserCommands{
		identityApp: identityApp,
	}
}

func (uc *UserCommands) RegisterCommands(registrar console.Registrar) {
	userCmds := registrar.Register("user", nil,
		console.Description("User management commands"),
	)

	userCmds.Register("create-admin", console.HandlerFunc(uc.CreateAdmin),
		console.Description("Create a new admin user"),
		console.Flag("name", "Full name of the new admin user").Required().String(),
		console.Flag("username", "Username for the new admin user").Required().String(),
		console.Flag("email", "Email address for the new admin user").Required().String(),
		console.Flag("password", "Password for the new admin user").Required().String(),
	)
}

func (uc *UserCommands) CreateAdmin(w console.CommandWriter, r *console.Request) error {
	flags := r.Flags()
	user, err := uc.identityApp.CreateAdminUser(r.Context(), &application.CreateUserRequest{
		Name:     flags.Get("name").String(),
		Username: flags.Get("username").String(),
		Email:    flags.Get("email").String(),
		Password: flags.Get("password").String(),
	})
	if err != nil {
		return fmt.Errorf("failed to create admin user: %w", err)
	}

	w.Println("Admin user created successfully:")
	w.Printf("ID: %s\n", user.ID)
	w.Printf("Username: %s\n", user.Username)
	w.Printf("Email: %s\n", user.Email)
	return nil
}
