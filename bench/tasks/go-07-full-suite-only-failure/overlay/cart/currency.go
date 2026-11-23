package cart

var currency = "USD"

func SetCurrency(c string) { currency = c }

func Currency() string { return currency }
