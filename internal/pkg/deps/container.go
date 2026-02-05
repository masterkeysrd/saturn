package deps

import (
	"fmt"

	"go.uber.org/dig"
)

type In struct {
	dig.In
}

type Container interface {
	Injector
	Invoke(fn any) error
	String() string
}

func Register(inj Injector, providers ...Provider) error {
	for _, provide := range providers {
		if err := provide(inj); err != nil {
			return fmt.Errorf("cannot register dependencies: %w", err)
		}
	}

	return nil
}

type DigContainer struct {
	container *dig.Container
}

func NewDigContainer() *DigContainer {
	return &DigContainer{
		container: dig.New(),
	}
}

func (c *DigContainer) Provide(constructor any, opts ...ProvideOption) error {
	provOpts := &provideOpts{}
	for _, opt := range opts {
		opt.apply(provOpts)
	}

	digOpts := make([]dig.ProvideOption, 0, 2)
	if provOpts.name != "" {
		digOpts = append(digOpts, dig.Name(provOpts.name))
	}

	if provOpts.as != nil {
		digOpts = append(digOpts, dig.As(provOpts.as...))
	}

	return c.container.Provide(constructor, digOpts...)
}

func (c *DigContainer) Invoke(fn any) error {
	return c.container.Invoke(fn)
}

func (c *DigContainer) String() string {
	return c.container.String()
}
