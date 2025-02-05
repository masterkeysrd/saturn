package lists

import (
	"fmt"

	"github.com/masterkeysrd/saturn/internal/foundations/errors"
)

// List is a list of generic items.
type List struct {
	// Name this name should be unique.
	Name string `dynamodbav:"name"`

	// Items the items in the list.
	Items []*Item `dynamodbav:"items"`

	// items is a map of items.
	items map[string]int
}

func (l *List) Validate() error {
	if l.Name == "" {
		return errors.New("name is required")
	}

	for idx, item := range l.Items {
		if err := item.Validate(); err != nil {
			return fmt.Errorf("item at index %d: %w", idx, err)
		}
	}

	return nil
}

func (l *List) AddItem(item *Item) error {
	if l.items == nil {
		l.loadItems()
	}

	if _, ok := l.items[item.ID]; ok {
		return errors.New("item already exists")
	}

	l.Items = append(l.Items, item)
	l.items[item.ID] = len(l.Items) - 1
	return nil
}

func (l *List) UpdateItem(item *Item) error {
	if l.items == nil {
		l.loadItems()
	}

	idx, ok := l.items[item.ID]
	if !ok {
		return errors.New("item does not exist")
	}

	l.Items[idx] = item
	return nil
}

func (l *List) RemoveItem(id string) error {
	if l.items == nil {
		l.loadItems()
	}

	idx, ok := l.items[id]
	if !ok {
		return errors.New("item does not exist")
	}

	l.Items = append(l.Items[:idx], l.Items[idx+1:]...)
	delete(l.items, id)
	return nil
}

func (l *List) ItemByID(id string) *Item {
	if l.items == nil {
		l.loadItems()
	}

	idx, ok := l.items[id]
	if !ok {
		return nil
	}

	return l.Items[idx]
}

func (l *List) loadItems() {
	l.items = make(map[string]int, len(l.Items))
	for idx, item := range l.Items {
		l.items[item.ID] = idx
	}
}

// Item is a generic item in a list.
type Item struct {
	// ID the unique identifier for the item.
	ID string `dynamodbav:"id"`

	// Name the name of the item.
	Name string `dynamodbav:"name"`
}

func (i *Item) Validate() error {
	if i.ID == "" {
		return errors.New("id is required")
	}

	if i.Name == "" {
		return errors.New("name is required")
	}

	return nil
}
