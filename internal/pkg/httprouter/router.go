package httprouter

import "net/http"

type RoutesRegister interface {
	RegisterRoutes(*http.ServeMux)
}
