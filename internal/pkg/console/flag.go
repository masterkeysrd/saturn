package console

type FlagBuilder struct {
	name        string
	description string
	required    bool
	kind        FlagKind
}

func (ab *FlagBuilder) Required() *FlagBuilder {
	ab.required = true
	return ab
}

func (ab *FlagBuilder) String() Option {
	return func(opts *commandOptions) {
		opts.flags = append(opts.flags, FlagSpec{
			Name:        ab.name,
			Description: ab.description,
			Required:    ab.required,
			Kind:        FlagKindString,
		})
	}
}

func (ab *FlagBuilder) Int() Option {
	return func(opts *commandOptions) {
		opts.flags = append(opts.flags, FlagSpec{
			Name:        ab.name,
			Description: ab.description,
			Required:    ab.required,
			Kind:        FlagKindInt,
		})
	}
}

func (ab *FlagBuilder) Bool() Option {
	return func(opts *commandOptions) {
		opts.flags = append(opts.flags, FlagSpec{
			Name:        ab.name,
			Description: ab.description,
			Required:    ab.required,
			Kind:        FlagKindBool,
		})
	}
}

type Flags map[string]FlagVal

func (a Flags) Get(name string) FlagVal {
	return a[name]
}

type FlagVal struct {
	spec  FlagSpec
	value any
}

func (a FlagVal) Name() string {
	return a.spec.Name
}

func (a FlagVal) Description() string {
	return a.spec.Description
}

func (a FlagVal) Required() bool {
	return a.spec.Required
}

func (a FlagVal) Kind() FlagKind {
	return a.spec.Kind
}

func (a FlagVal) String() string {
	if a.spec.Kind != FlagKindString {
		panic("flag kind is not string")
	}
	s, ok := a.value.(*string)
	if !ok {
		panic("flag value is not string")
	}
	if s == nil {
		return ""
	}
	return *s
}

func (a FlagVal) Int() int {
	if a.spec.Kind != FlagKindInt {
		panic("flag kind is not int")
	}
	i, ok := a.value.(*int)
	if !ok {
		panic("flag value is not int")
	}
	if i == nil {
		return 0
	}
	return *i
}

func (a FlagVal) Bool() bool {
	if a.spec.Kind != FlagKindBool {
		panic("flag kind is not bool")
	}
	b, ok := a.value.(*bool)
	if !ok {
		panic("flag value is not bool")
	}
	if b == nil {
		return false
	}
	return *b
}

type FlagSpec struct {
	Name        string
	Description string
	Required    bool
	Kind        FlagKind
}

type FlagKind int

const (
	FlagKindString FlagKind = iota
	FlagKindInt
	FlagKindBool
)
