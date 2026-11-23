package main

import "testing"

func TestRun(t *testing.T) {
	if got := Run(); got != "3" {
		t.Fatalf("got %v", got)
	}
}
