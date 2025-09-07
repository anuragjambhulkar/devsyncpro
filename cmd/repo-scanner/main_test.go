package main

import "testing"

func TestParseGoMod_NotExist(t *testing.T) {
	_, err := parseGoMod("does/not/exist")
	if err == nil {
		t.Fatalf("expected error, got nil")
	}
}
