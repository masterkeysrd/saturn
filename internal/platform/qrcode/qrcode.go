package qrcode

import (
	"fmt"
	"strings"

	skip2qr "github.com/skip2/go-qrcode"
)

// GenerateSVG produces inline resolution-independent SVG markup for any given text content.
func GenerateSVG(content string) (string, error) {
	qr, err := skip2qr.New(content, skip2qr.Medium)
	if err != nil {
		return "", fmt.Errorf("generate qr code: %w", err)
	}

	bitmap := qr.Bitmap()
	size := len(bitmap)

	var sb strings.Builder
	fmt.Fprintf(&sb, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" shape-rendering="crispEdges">`, size, size)
	sb.WriteString(`<rect width="100%" height="100%" fill="#ffffff"/>`)
	for y, row := range bitmap {
		for x, isBlack := range row {
			if isBlack {
				fmt.Fprintf(&sb, `<rect x="%d" y="%d" width="1" height="1" fill="#000000"/>`, x, y)
			}
		}
	}
	sb.WriteString(`</svg>`)

	return sb.String(), nil
}
