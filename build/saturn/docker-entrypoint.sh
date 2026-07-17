#!/bin/sh
set -eu

private_key_path=${SATURN_AUTH_PRIVATE_KEY_PATH:-/etc/saturn/keys/private.pem}
private_key_dir=$(dirname "$private_key_path")

mkdir -p "$private_key_dir"

if [ ! -f "$private_key_path" ]; then
	umask 077
	openssl genpkey -algorithm ED25519 -outform DER -out "$private_key_path"
fi

exec "$@"
