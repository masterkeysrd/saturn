package crypto

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"crypto/x509"
	"errors"
	"fmt"
	"math/big"
)

// ECDSAVerifier verifies ECDSA P-256 (ES256) signatures across various mobile platform encodings.
type ECDSAVerifier struct{}

// NewECDSAVerifier creates a new ECDSAVerifier.
func NewECDSAVerifier() *ECDSAVerifier {
	return &ECDSAVerifier{}
}

// VerifyAssertionParams encapsulates the cryptographic inputs needed for assertion verification.
type VerifyAssertionParams struct {
	PublicKey []byte
	Algorithm string
	Challenge string
	Signature []byte
}

// VerifyAssertion validates an ECDSA P-256 signature over a challenge string using the provided public key.
// It supports both DER-encoded SubjectPublicKeyInfo (PKIX) and ANSI X9.62 raw point encodings,
// and supports both ASN.1 DER and raw IEEE P1363 (r || s) signature encodings.
func (v *ECDSAVerifier) VerifyAssertion(params VerifyAssertionParams) error {
	if params.Algorithm != "ES256" {
		return fmt.Errorf("unsupported key algorithm: %q (only ES256 is supported)", params.Algorithm)
	}
	if len(params.PublicKey) == 0 {
		return errors.New("empty public key")
	}
	if len(params.Challenge) == 0 {
		return errors.New("empty challenge")
	}
	if len(params.Signature) == 0 {
		return errors.New("empty signature")
	}

	pubKey, err := parseECDSAP256PublicKey(params.PublicKey)
	if err != nil {
		return fmt.Errorf("parse public key: %w", err)
	}

	hash := sha256.Sum256([]byte(params.Challenge))

	// 1. Try ASN.1 DER signature verification (standard for iOS Secure Enclave and WebCrypto)
	if ecdsa.VerifyASN1(pubKey, hash[:], params.Signature) {
		return nil
	}

	// 2. Try raw IEEE P1363 (64 bytes: 32 bytes r + 32 bytes s, standard for Android KeyStore)
	if len(params.Signature) == 64 {
		r := new(big.Int).SetBytes(params.Signature[:32])
		s := new(big.Int).SetBytes(params.Signature[32:])
		if ecdsa.Verify(pubKey, hash[:], r, s) {
			return nil
		}
	}

	return errors.New("signature verification failed")
}

func parseECDSAP256PublicKey(data []byte) (*ecdsa.PublicKey, error) {
	// 1. Attempt PKIX / SubjectPublicKeyInfo DER parsing (standard export format)
	if parsedKey, err := x509.ParsePKIXPublicKey(data); err == nil {
		if ecKey, ok := parsedKey.(*ecdsa.PublicKey); ok && ecKey.Curve == elliptic.P256() {
			return ecKey, nil
		}
	}

	// 2. Attempt ANSI X9.62 uncompressed point (65 bytes: 0x04 || X || Y)
	curve := elliptic.P256()
	if len(data) == 65 && data[0] == 0x04 {
		x, y := elliptic.Unmarshal(curve, data)
		if x != nil && y != nil {
			return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
		}
	}

	// 3. Attempt ANSI X9.62 compressed point (33 bytes: 0x02/0x03 || X)
	if len(data) == 33 && (data[0] == 0x02 || data[0] == 0x03) {
		x, y := elliptic.UnmarshalCompressed(curve, data)
		if x != nil && y != nil {
			return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
		}
	}

	// 4. Attempt raw coordinates without prefix (64 bytes: X || Y)
	if len(data) == 64 {
		prefixed := append([]byte{0x04}, data...)
		x, y := elliptic.Unmarshal(curve, prefixed)
		if x != nil && y != nil {
			return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}, nil
		}
	}

	return nil, errors.New("unrecognized or invalid ECDSA P-256 public key encoding")
}
