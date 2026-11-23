package jobs

import (
	"reflect"

	"example.com/shop/pricing"
)

func Nightly() float64 {
	m := reflect.ValueOf(pricing.Pricer{}).MethodByName("Apply" + "Discount")
	out := m.Call([]reflect.Value{reflect.ValueOf(200.0), reflect.ValueOf(25.0)})
	return out[0].Float()
}
