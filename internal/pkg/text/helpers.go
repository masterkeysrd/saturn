// Package text contains text manipulation utilities.
package text

func Singularize(word string) string {
	if len(word) > 3 && word[len(word)-3:] == "ies" {
		return word[:len(word)-3] + "y"
	}
	if len(word) > 3 && word[len(word)-1:] == "ses" {
		return word[:len(word)-2]
	}
	if len(word) > 2 && word[len(word)-1:] == "s" {
		return word[:len(word)-1]
	}
	return word
}
