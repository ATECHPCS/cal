package store

// AES-256-GCM at-rest encryption for CalDAV account passwords. The key is a
// random 32-byte value generated once and persisted in server_config, so no
// secret lives in code or env.

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
)

func (s *Store) cryptoKey(ctx context.Context) ([]byte, error) {
	raw, err := s.ServerConfig(ctx, "crypto_key")
	if err == nil {
		return base64.StdEncoding.DecodeString(raw)
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := s.SetServerConfig(ctx, "crypto_key", base64.StdEncoding.EncodeToString(key)); err != nil {
		return nil, err
	}
	return key, nil
}

// MACKey returns a stable per-instance key for HMAC signing (OAuth state etc.).
// Derived from the persisted crypto key so it survives restarts and is the
// same on every call — unlike Encrypt, whose random nonce makes its output
// unusable as a signing key.
func (s *Store) MACKey(ctx context.Context, purpose string) ([]byte, error) {
	key, err := s.cryptoKey(ctx)
	if err != nil {
		return nil, err
	}
	h := sha256.New()
	h.Write(key)
	h.Write([]byte("mac:" + purpose))
	return h.Sum(nil), nil
}

func (s *Store) Encrypt(ctx context.Context, plaintext string) (string, error) {
	key, err := s.cryptoKey(ctx)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(plaintext), nil)), nil
}

func (s *Store) Decrypt(ctx context.Context, encoded string) (string, error) {
	key, err := s.cryptoKey(ctx)
	if err != nil {
		return "", err
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	plain, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
	if err != nil {
		return "", err
	}
	return string(plain), nil
}
