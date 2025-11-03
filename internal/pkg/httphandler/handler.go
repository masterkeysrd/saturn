package httphandler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

type HandleOption[Req, Resp any] interface {
	apply(*handleOpts[Req, Resp])
}

type handleOption[Req any, Resp any] func(*handleOpts[Req, Resp])

func (h handleOption[Req, Resp]) apply(opts *handleOpts[Req, Resp]) {
	h(opts)
}

func WithInputTransformer[Req, Resp any](t HandleInputTransformer[Req]) HandleOption[Req, Resp] {
	return handleOption[Req, Resp](func(o *handleOpts[Req, Resp]) {
		o.transformInput = t
	})
}

func WithOutputTransformer[Req, Resp any](t HandleOutputTransformer[Resp]) HandleOption[Req, Resp] {
	return handleOption[Req, Resp](func(o *handleOpts[Req, Resp]) {
		o.transformOutput = t
	})
}

// WithStatusCode sets a default status code for successful responses
func WithStatusCode[Req, Resp any](code int) HandleOption[Req, Resp] {
	return handleOption[Req, Resp](func(o *handleOpts[Req, Resp]) {
		o.statusCode = code
	})
}

func WithCreated[Req, Resp any]() HandleOption[Req, Resp] {
	return WithStatusCode[Req, Resp](http.StatusCreated)
}

type handleOpts[Req any, Resp any] struct {
	statusCode      int
	transformInput  HandleInputTransformer[Req]
	transformOutput HandleOutputTransformer[Resp]
}

type HandleInputTransformer[Req any] func(context.Context, *http.Request) (Req, error)

func DefaultTransformInput[Req any](ctx context.Context, req *http.Request) (Req, error) {
	var in Req
	if err := json.NewDecoder(req.Body).Decode(&in); err != nil {
		return in, fmt.Errorf("cannot decode json body into input: %w", err)
	}

	return in, nil
}

type HandleOutputTransformer[Resp any] func(context.Context, http.ResponseWriter, Resp) error

func DefaultTransformOutput[Req, Resp any](defaultCode int) HandleOutputTransformer[Resp] {
	if defaultCode == 0 {
		defaultCode = http.StatusOK
	}

	return func(ctx context.Context, w http.ResponseWriter, out Resp) error {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(defaultCode)
		if err := json.NewEncoder(w).Encode(&out); err != nil {
			return fmt.Errorf("cannot encode output into json: %w", err)
		}

		return nil
	}
}

func Handle[Req any, Resp any](handle func(context.Context, Req) (Resp, error), options ...HandleOption[Req, Resp]) http.Handler {
	if handle == nil {
		panic("handle is nil")
	}

	opts := handleOpts[Req, Resp]{
		transformInput: DefaultTransformInput[Req],
	}

	for _, opt := range options {
		opt.apply(&opts)
	}

	if opts.transformOutput == nil {
		opts.transformOutput = DefaultTransformOutput[Req, Resp](opts.statusCode)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		var in Req
		if !isEmpty(in) {
			val, err := opts.transformInput(ctx, r)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

			in = val
		}

		out, err := handle(ctx, in)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		empty := isEmpty(out)
		statusCode := opts.statusCode
		if statusCode == 0 {
			if empty {
				statusCode = http.StatusNoContent
			} else {
				statusCode = http.StatusOK
			}
		}

		if empty || statusCode == http.StatusNoContent {
			w.WriteHeader(statusCode)
			return
		}

		if err := opts.transformOutput(ctx, w, out); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	})
}

type Empty struct{}

func isEmpty(i any) bool {
	switch i.(type) {
	case Empty, *Empty:
		return true
	default:
		return false
	}
}
