package hidden_tests

import (
	"testing"

	"example.com/shop/pricing"
	"example.com/shop/reports"
)

func TestRenamed(t *testing.T) {
	if pricing.CalculateDiscount(200, 25) != 150 {
		t.Fatal("discount")
	}
	if reports.SummaryLine(100, 10) != "$90.00" {
		t.Fatal("summary")
	}
}
