package main

import "testing"

func TestRunPrintsTheTaxedPrice(t *testing.T) {
	if got := Run(); got != "53.5" {
		t.Fatalf("got %v", got)
	}
}
