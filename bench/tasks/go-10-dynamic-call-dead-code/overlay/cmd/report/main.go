package main

import (
	"fmt"
	"reflect"

	"example.com/shop/legacy"
)

func Run() string {
	m := reflect.ValueOf(legacy.Tools{}).MethodByName("Legacy" + "Round")
	out := m.Call([]reflect.Value{reflect.ValueOf(2.6)})
	return fmt.Sprint(out[0].Int())
}

func main() {
	fmt.Println(Run())
}
