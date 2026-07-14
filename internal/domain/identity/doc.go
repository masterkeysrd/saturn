// Package identity provides the domain model and storage interfaces for user identity management.
//
// The identity domain models the User entity and its associated credentials,
// with persistent storage defined through interfaces that allow flexible
// backend implementations.
//
// Types:
//
//	User — represents a registered user with identity fields and optimistic locking.
//	Credential — stores user authentication secrets keyed by auth type.
//	UserID — a KSUID-based string type with prefix validation.
//
// Interfaces:
//
//	UserStore — CRUD operations for user entities.
//	UserCredentialStore — CRUD operations for user credentials.
package identity
