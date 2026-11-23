package hidden_tests

import (
	"testing"

	"example.com/shop/jobs"
	"example.com/shop/pricing"
)

func TestRenamedAndJobWorks(t *testing.T) {
	if pricing.CalculateDiscount(200, 25) != 150 {
		t.Fatal("discount")
	}
	if jobs.Nightly() != 150 {
		t.Fatal("job")
	}
}
