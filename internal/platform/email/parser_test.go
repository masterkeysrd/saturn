package email

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestParse(t *testing.T) {
	rawSMTP := `From: David Morales <morales.david1997@gmail.com>
Subject: Fwd: =?UTF-8?Q?Transacci=C3=B3n_entre_mis_productos?=
Content-Type: multipart/alternative; boundary="boundary123"

--boundary123
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: quoted-printable

A continuaci=C3=B3n la informaci=C3=B3n relacionada a tu transacci=C3=B3n:
Monto: RD$ 38,098.28
--boundary123
Content-Type: text/html; charset="UTF-8"

<div>Duplicate html body</div>
--boundary123--`

	parsed, err := Parse(strings.NewReader(rawSMTP), nil)
	if err != nil {
		t.Fatalf("unexpected error parsing email: %v", err)
	}

	if parsed.Sender != "David Morales <morales.david1997@gmail.com>" {
		t.Errorf("expected sender, got %q", parsed.Sender)
	}

	// Should decode the UTF-8 word encoded Subject header
	if parsed.Subject != "Fwd: Transacción entre mis productos" {
		t.Errorf("expected subject, got %q", parsed.Subject)
	}

	// Should decode quoted-printable text body
	expectedBody := "A continuación la información relacionada a tu transacción:\nMonto: RD$ 38,098.28"
	if parsed.Body != expectedBody {
		t.Errorf("expected body:\n%q\ngot:\n%q", expectedBody, parsed.Body)
	}
}

func TestParseWithAttachments(t *testing.T) {
	// Raw SMTP message with a plain text body and a base64 encoded text attachment
	rawSMTP := `From: Sender <sender@domain.com>
Subject: Invoice Attached
Content-Type: multipart/mixed; boundary="mixed_boundary"

--mixed_boundary
Content-Type: multipart/alternative; boundary="alt_boundary"

--alt_boundary
Content-Type: text/plain; charset="UTF-8"

Please see the attached invoice.
--alt_boundary--

--mixed_boundary
Content-Type: application/pdf; name="invoice.pdf"
Content-Disposition: attachment; filename="invoice.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQKJdDF5OQ4CmVuZG9iagoxIDAgb2JqCjw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iag==
--mixed_boundary--`

	parsed, err := Parse(strings.NewReader(rawSMTP), nil)
	if err != nil {
		t.Fatalf("unexpected error parsing attachments: %v", err)
	}

	if parsed.Body != "Please see the attached invoice." {
		t.Errorf("expected body, got %q", parsed.Body)
	}

	if len(parsed.Attachments) != 1 {
		t.Fatalf("expected 1 attachment, got %d", len(parsed.Attachments))
	}

	att := parsed.Attachments[0]
	if att.Filename != "invoice.pdf" {
		t.Errorf("expected filename 'invoice.pdf', got %q", att.Filename)
	}
	if att.ContentType != "application/pdf" {
		t.Errorf("expected content type 'application/pdf', got %q", att.ContentType)
	}

	// Verify base64 decoded content bytes
	expectedData := "JVBERi0xLjQKJdDF5OQ4CmVuZG9iagoxIDAgb2JqCjw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iag=="
	decodedData, _ := base64.StdEncoding.DecodeString(expectedData)
	if string(att.Data) != string(decodedData) {
		t.Errorf("expected decoded data %q, got %q", string(decodedData), string(att.Data))
	}
}

func TestParseHTMLFallback(t *testing.T) {
	rawSMTP := `From: BHD <Alertas@bhd.com.do>
Subject: BHD Notificacion de Transacciones
Content-Type: multipart/related; type="text/html"; boundary="boundary_html"

--boundary_html
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<html>
<head>
<style>body { font-family: sans-serif; }</style>
</head>
<body>
<div>BHD Notificacion de Transacciones</div>
<p>Te notificamos la transaccion realizada con tu Tarjeta Visa Mi Pais # 2963</p>
</body>
</html>
--boundary_html--`

	parsed, err := Parse(strings.NewReader(rawSMTP), nil)
	if err != nil {
		t.Fatalf("unexpected error parsing HTML email: %v", err)
	}

	if !strings.Contains(parsed.Body, "BHD Notificacion de Transacciones") {
		t.Errorf("expected parsed body to contain header, got %q", parsed.Body)
	}

	if strings.Contains(parsed.Body, "<style>") || strings.Contains(parsed.Body, "body {") {
		t.Errorf("expected parsed body to exclude style block, got %q", parsed.Body)
	}
}
