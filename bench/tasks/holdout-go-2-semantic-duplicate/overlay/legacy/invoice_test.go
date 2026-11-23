package legacy

import "testing"

func TestInvoiceTotal(t *testing.T) {
	if got := InvoiceTotal(100); got != 107 {
		t.Fatalf("got %v", got)
	}
}
