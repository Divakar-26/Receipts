package router

import "testing"

func TestRoutesByName(t *testing.T) {
	if Handle("/price", 5, 0) != "$5.00" {
		t.Fatal("price")
	}
}
