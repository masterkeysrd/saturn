// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package conv

import (
	"testing"
)

type MyString string

func TestString(t *testing.T) {
	var val MyString = "hello"
	s := String(val)
	if s != "hello" {
		t.Errorf("String() = %q, want %q", s, "hello")
	}
}

func TestStringPtr(t *testing.T) {
	var nilPtr *MyString = nil
	if res := StringPtr(nilPtr); res != nil {
		t.Errorf("StringPtr(nil) = %v, want nil", res)
	}

	var val MyString = "world"
	ptr := &val
	res := StringPtr(ptr)
	if res == nil {
		t.Fatal("StringPtr() returned nil for non-nil input")
	}
	if *res != "world" {
		t.Errorf("StringPtr() = %q, want %q", *res, "world")
	}
}

func TestPtr(t *testing.T) {
	if res := Ptr(""); res != nil {
		t.Errorf("Ptr(\"\") = %v, want nil", res)
	}
	if res := Ptr(0); res != nil {
		t.Errorf("Ptr(0) = %v, want nil", res)
	}

	resStr := Ptr("hello")
	if resStr == nil || *resStr != "hello" {
		t.Errorf("Ptr(\"hello\") = %v, want \"hello\"", resStr)
	}

	resInt := Ptr(42)
	if resInt == nil || *resInt != 42 {
		t.Errorf("Ptr(42) = %v, want 42", resInt)
	}
}
