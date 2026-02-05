package deps

type ProvideOption interface {
	apply(*provideOpts)
}

type provideOptFn func(*provideOpts)

func (fn provideOptFn) apply(opts *provideOpts) {
	fn(opts)
}

type provideOpts struct {
	name string
	as   []any
}

type Provider func(Injector) error

func Name(name string) ProvideOption {
	return provideOptFn(func(opts *provideOpts) {
		opts.name = name
	})
}

func As(as ...any) ProvideOption {
	return provideOptFn(func(opts *provideOpts) {
		opts.as = as
	})
}

type Injector interface {
	Provide(constructor any, opts ...ProvideOption) error
}
