package reports

import "testing"

func TestSummaryLineFormatsTheDiscountedPrice(t *testing.T) {
	if got := SummaryLine(100, 10); got != "$90.00" {
		t.Fatalf("got %v", got)
	}
}
