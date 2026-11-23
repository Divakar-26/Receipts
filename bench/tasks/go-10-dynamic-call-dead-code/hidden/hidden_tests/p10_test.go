package hidden_tests

import (
	"os/exec"
	"reflect"
	"strings"
	"testing"

	"example.com/shop/legacy"
)

func TestLegacyRoundIsGone(t *testing.T) {
	if _, ok := reflect.TypeOf(legacy.Tools{}).MethodByName("LegacyRound"); ok {
		t.Fatal("method still exists")
	}
}

func TestReportStillRuns(t *testing.T) {
	out, err := exec.Command("go", "run", "../cmd/report").Output()
	if err != nil || strings.TrimSpace(string(out)) != "3" {
		t.Fatalf("got %q %v", out, err)
	}
}
