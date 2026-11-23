package main

import "fmt"

func Run() string {
	n := 2.6
	return fmt.Sprint(int(n + 0.5))
}

func main() {
	fmt.Println(Run())
}
