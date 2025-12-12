package identityhttp

import (
	"log"
	"net/http"

	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	"github.com/masterkeysrd/saturn/internal/pkg/httprouter"
)

type Controllers struct {
	deps.In

	Users    *UsersController
	Sessions *SessionsController
}

type Router struct {
	registers []httprouter.RoutesRegister
}

func NewRouter(c Controllers) *Router {
	registers := []httprouter.RoutesRegister{
		c.Users,
		c.Sessions,
	}

	return &Router{
		registers: registers,
	}
}

func (r *Router) RegisterRoutes(mux *http.ServeMux) {
	log.Println("Registering identity routes")
	handler := http.NewServeMux()

	for _, register := range r.registers {
		register.RegisterRoutes(handler)
	}

	mux.Handle("/identity/", http.StripPrefix("/identity", handler))
}
