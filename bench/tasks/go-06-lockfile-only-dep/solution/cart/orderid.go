package cart

import "example.com/ids"

func NewOrderID(n int) string {
	return ids.New(n)
}
