package router

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"example.com/shop/pricing"
)

//go:embed routes.json
var raw []byte

var routes = func() map[string]string {
	m := map[string]string{}
	if err := json.Unmarshal(raw, &m); err != nil {
		panic(err)
	}
	return m
}()

func Handle(path string, a, b float64) string {
	switch routes[path] {
	case "FormatPrice":
		return pricing.FormatPrice(a)
	case "ApplyDiscount":
		return fmt.Sprintf("%.2f", pricing.ApplyDiscount(a, b))
	}
	return ""
}
