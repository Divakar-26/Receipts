package hidden_tests

import (
	"os/exec"
	"strings"
	"testing"

	"example.com/shop/pricing"
)

func TestRenamed(t *testing.T) {
	if pricing.AddTax(100) != 107 {
		t.Fatal("addtax")
	}
	out, err := exec.Command("go", "run", "../cmd/quote").Output()
	if err != nil || strings.TrimSpace(string(out)) != "53.5" {
		t.Fatalf("got %q %v", out, err)
	}
}
