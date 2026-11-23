package config

import (
	"os"
	"strconv"
)

func Timeout() int {
	v, err := strconv.Atoi(os.Getenv("SHOP_TIMEOUT"))
	if err != nil {
		return 5
	}
	return v
}
