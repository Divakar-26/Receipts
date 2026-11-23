package jobs

import "testing"

func TestNightlyAppliesTheDiscount(t *testing.T) {
	if got := Nightly(); got != 150 {
		t.Fatalf("got %v", got)
	}
}
