package pdf_test

import (
	"bytes"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/pdf"
	pdfcpuapi "github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

const minimalPdf = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 100 100]>> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer <</Size 4 /Root 1 0 R>>
startxref
190
%%EOF`

func TestPdfEncryptionAndDecryption(t *testing.T) {
	raw := []byte(minimalPdf)

	isEnc, err := pdf.IsEncrypted(raw)
	if err != nil {
		t.Fatalf("IsEncrypted failed on raw pdf: %v", err)
	}
	if isEnc {
		t.Errorf("expected unencrypted pdf, got encrypted")
	}

	// Encrypt using pdfcpu
	conf := model.NewAESConfiguration("secret123", "owner123", 256)
	var encBuf bytes.Buffer
	err = pdfcpuapi.Encrypt(bytes.NewReader(raw), &encBuf, conf)
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	encBytes := encBuf.Bytes()
	isEnc, err = pdf.IsEncrypted(encBytes)
	if err != nil {
		t.Fatalf("IsEncrypted on encBytes failed: %v", err)
	}
	if !isEnc {
		t.Errorf("expected encrypted pdf, got unencrypted")
	}

	// Try decrypt with wrong password
	_, err = pdf.Decrypt(encBytes, "wrongpassword")
	if err == nil {
		t.Errorf("expected error decrypting with wrong password")
	}

	// Try decrypt with correct password
	decBytes, err := pdf.Decrypt(encBytes, "secret123")
	if err != nil {
		t.Fatalf("expected successful decrypt, got: %v", err)
	}

	isEncAfter, err := pdf.IsEncrypted(decBytes)
	if err != nil {
		t.Fatalf("IsEncrypted after decrypt failed: %v", err)
	}
	if isEncAfter {
		t.Errorf("expected decrypted pdf to not be encrypted")
	}
}
