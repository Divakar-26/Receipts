package router

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"example.com/shop/pricing"
)

func root() string {
	d, _ := os.Getwd()
	for {
		if _, err := os.Stat(filepath.Join(d, "go.mod")); err == nil {
			return d
		}
		p := filepath.Dir(d)
		if p == d {
			return "."
		}
		d = p
	}
}

func routes() map[string]string {
	name := "routes.json"
	if os.Getenv("SHOP_ENV") == "dev" {
		if _, err := os.Stat(filepath.Join(root(), "config", "routes.local.json")); err == nil {
			name = "routes.local.json"
		}
	}
	b, err := os.ReadFile(filepath.Join(root(), "config", name))
	if err != nil {
		panic(err)
	}
	m := map[string]string{}
	if err := json.Unmarshal(b, &m); err != nil {
		panic(err)
	}
	return m
}

func Handle(path string, a, b float64) string {
	switch routes()[path] {
	case "FormatPrice":
		return pricing.FormatPrice(a)
	case "ApplyDiscount":
		return fmt.Sprintf("%.2f", pricing.ApplyDiscount(a, b))
	}
	return ""
}
