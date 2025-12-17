// Package mnemo (Mnemosyne) provides a simple in-memory caching mechanism
// with expiration support for cached items.
package mnemo

import (
	"errors"
	"sync"
	"time"
)

const (
	EvictionInterval = 60 * time.Second
)

type Config struct {
	// DefaultTTL is the default time-to-live for cached items.
	DefaultTTL time.Duration
}

var ErrCacheClosed = errors.New("cache is closed")

type Cache struct {
	cfg Config

	done chan struct{}

	wg        sync.WaitGroup
	closeOnce sync.Once
	mu        sync.RWMutex
	isClosed  bool
	items     map[string]item
}

func NewCache(cfg Config) *Cache {
	c := &Cache{
		cfg:   cfg,
		done:  make(chan struct{}),
		items: make(map[string]item, 128),
	}

	c.wg.Add(1)
	go c.startEvictionLoop()

	return c
}

func (c *Cache) GetString(key string) (string, bool, error) {
	it, found, err := c.get(key)
	if err != nil || !found {
		return "", found, err
	}

	v, err := it.String()
	if err != nil {
		return "", false, err
	}

	return v, true, nil
}

func (c *Cache) SetString(key string, value string) error {
	return c.set(key, item{k: KindString, s: value}, c.cfg.DefaultTTL)
}

func (c *Cache) SetStringEx(key string, value string, ttl time.Duration) error {
	return c.set(key, item{k: KindString, s: value}, ttl)
}

func (c *Cache) GetInt64(key string) (int64, bool, error) {
	it, found, err := c.get(key)
	if err != nil || !found {
		return 0, found, err
	}

	v, err := it.Int64()
	if err != nil {
		return 0, false, err
	}

	return v, true, nil
}

func (c *Cache) SetInt64(key string, value int64) error {
	return c.set(key, item{k: KindInt64, i: value}, c.cfg.DefaultTTL)
}

func (c *Cache) GetAny(key string) (any, bool, error) {
	it, found, err := c.get(key)
	if err != nil || !found {
		return nil, found, err
	}

	v, err := it.Any()
	if err != nil {
		return nil, false, err
	}

	return v, true, nil
}

func (c *Cache) SetAny(key string, value any) error {
	return c.set(key, item{k: KindAny, a: value}, c.cfg.DefaultTTL)
}

func (c *Cache) Delete(key string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.isClosed {
		return ErrCacheClosed
	}

	delete(c.items, key)
	return nil
}

func (c *Cache) Close() error {
	c.closeOnce.Do(func() {
		close(c.done)
		c.mu.Lock()
		defer c.mu.Unlock()
		c.isClosed = true
		c.items = nil
	})

	c.wg.Wait()
	return nil
}

func (c *Cache) set(key string, it item, ttl time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.isClosed {
		return ErrCacheClosed
	}

	if ttl > 0 {
		it.exp = time.Now().Add(ttl).UnixNano()
	}

	c.items[key] = it
	return nil
}

func (c *Cache) get(key string) (item, bool, error) {
	c.mu.RLock()

	if c.isClosed {
		c.mu.RUnlock()
		return item{}, false, ErrCacheClosed
	}

	it, ok := c.items[key]
	if !ok {
		c.mu.RUnlock()
		return item{}, false, nil
	}

	if time.Now().UnixNano() > it.exp {
		c.mu.RUnlock()

		c.mu.Lock()
		// Double-check expiration under write lock
		if it2, ok := c.items[key]; ok && time.Now().UnixNano() > it2.exp {
			delete(c.items, key)
		}
		c.mu.Unlock()

		return item{}, false, nil
	}

	c.mu.RUnlock()
	return it, true, nil
}

func (c *Cache) startEvictionLoop() {
	ticker := time.NewTicker(EvictionInterval)
	defer func() {
		ticker.Stop()
		c.wg.Done()
	}()

	for {
		select {
		case <-ticker.C:
			c.evict()
		case <-c.done:
			return
		}
	}
}

func (c *Cache) evict() {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.isClosed {
		return
	}

	now := time.Now().UnixNano()
	for key, item := range c.items {
		if now > item.exp {
			delete(c.items, key)
		}
	}
}
