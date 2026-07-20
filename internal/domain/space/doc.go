// Package space provides the domain model and storage interfaces for workspace (space) management.
//
// The space domain models the Space entity (workspace) and its associated
// Member entities, with persistent storage defined through interfaces that
// allow flexible backend implementations.
//
// Types:
//
//	Space — represents a workspace with CRUD operations and ownership.
//	Member — represents a user's membership in a workspace with role-based access.
//	SpaceID — a KSUID-based string type with prefix validation.
//
// Interfaces:
//
//	SpaceStore — CRUD operations for space entities.
//	MemberStore — CRUD operations for member entities with access checks.
package space
