package crypto_test

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
)

func TestECDSAVerifier(t *testing.T) {
	privKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("failed to generate P-256 key: %v", err)
	}

	challenge := "chg_test_challenge_nonce_12345"
	hash := sha256.Sum256([]byte(challenge))

	// Generate ASN.1 DER signature
	derSig, err := ecdsa.SignASN1(rand.Reader, privKey, hash[:])
	if err != nil {
		t.Fatalf("failed to sign ASN.1: %v", err)
	}

	// Generate raw IEEE P1363 signature (r || s, 64 bytes)
	r, s, err := ecdsa.Sign(rand.Reader, privKey, hash[:])
	if err != nil {
		t.Fatalf("failed to sign raw: %v", err)
	}
	rawSig := make([]byte, 64)
	rBytes := r.Bytes()
	sBytes := s.Bytes()
	copy(rawSig[32-len(rBytes):32], rBytes)
	copy(rawSig[64-len(sBytes):64], sBytes)

	// PKIX DER public key
	pkixBytes, err := x509.MarshalPKIXPublicKey(&privKey.PublicKey)
	if err != nil {
		t.Fatalf("failed to marshal PKIX: %v", err)
	}

	// ANSI X9.62 uncompressed point (65 bytes)
	ansiUncompressed := elliptic.Marshal(elliptic.P256(), privKey.PublicKey.X, privKey.PublicKey.Y)

	// ANSI X9.62 compressed point (33 bytes)
	ansiCompressed := elliptic.MarshalCompressed(elliptic.P256(), privKey.PublicKey.X, privKey.PublicKey.Y)

	verifier := crypto.NewECDSAVerifier()

	tamperedSig := append([]byte(nil), derSig...)
	tamperedSig[len(tamperedSig)-1] ^= 0xff

	tests := []struct {
		name      string
		pubKey    []byte
		algo      string
		challenge string
		sig       []byte
		wantErr   bool
	}{
		{
			name:      "PKIX DER public key with ASN.1 signature",
			pubKey:    pkixBytes,
			algo:      "ES256",
			challenge: challenge,
			sig:       derSig,
			wantErr:   false,
		},
		{
			name:      "PKIX DER public key with IEEE P1363 raw signature",
			pubKey:    pkixBytes,
			algo:      "ES256",
			challenge: challenge,
			sig:       rawSig,
			wantErr:   false,
		},
		{
			name:      "ANSI X9.62 uncompressed with ASN.1 signature",
			pubKey:    ansiUncompressed,
			algo:      "ES256",
			challenge: challenge,
			sig:       derSig,
			wantErr:   false,
		},
		{
			name:      "ANSI X9.62 uncompressed with IEEE P1363 raw signature",
			pubKey:    ansiUncompressed,
			algo:      "ES256",
			challenge: challenge,
			sig:       rawSig,
			wantErr:   false,
		},
		{
			name:      "ANSI X9.62 compressed with raw signature",
			pubKey:    ansiCompressed,
			algo:      "ES256",
			challenge: challenge,
			sig:       rawSig,
			wantErr:   false,
		},
		{
			name:      "Wrong algorithm",
			pubKey:    pkixBytes,
			algo:      "RS256",
			challenge: challenge,
			sig:       derSig,
			wantErr:   true,
		},
		{
			name:      "Tampered challenge",
			pubKey:    pkixBytes,
			algo:      "ES256",
			challenge: "chg_tampered_challenge",
			sig:       derSig,
			wantErr:   true,
		},
		{
			name:      "Tampered signature",
			pubKey:    pkixBytes,
			algo:      "ES256",
			challenge: challenge,
			sig:       tamperedSig,
			wantErr:   true,
		},
		{
			name:      "Empty inputs",
			pubKey:    nil,
			algo:      "ES256",
			challenge: challenge,
			sig:       derSig,
			wantErr:   true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := verifier.VerifyAssertion(crypto.VerifyAssertionParams{
				PublicKey: tc.pubKey,
				Algorithm: tc.algo,
				Challenge: tc.challenge,
				Signature: tc.sig,
			})
			if (err != nil) != tc.wantErr {
				t.Fatalf("expected error: %v, got: %v", tc.wantErr, err)
			}
		})
	}
}
