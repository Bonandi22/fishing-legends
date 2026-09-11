#!/usr/bin/env bash
# One-time bootstrap for a brand new domain: nginx's 443 server block needs a
# certificate to even start, but certbot needs nginx running (to answer the
# HTTP-01 challenge) to issue one. This breaks that chicken-and-egg problem
# with a throwaway self-signed cert, then swaps in the real one.
#
# Usage: DOMAIN=example.com CERTBOT_EMAIL=you@example.com ./scripts/deploy/init-letsencrypt.sh
set -euo pipefail

if [ -z "${DOMAIN:-}" ] || [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "Usage: DOMAIN=example.com CERTBOT_EMAIL=you@example.com $0" >&2
  exit 1
fi

COMPOSE=(docker compose -f docker-compose.prod.yaml --env-file .env.production)
CERT_VOLUME="deep_blue_lure_prod_letsencrypt"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

echo "==> checking for an existing certificate for $DOMAIN"
if docker run --rm -v "$CERT_VOLUME":/etc/letsencrypt alpine test -d "$CERT_PATH"; then
  echo "Certificate already exists for $DOMAIN. Remove it first if you want to reissue." >&2
  exit 1
fi

echo "==> creating a dummy self-signed certificate so nginx can start"
docker run --rm -v "$CERT_VOLUME":/etc/letsencrypt alpine sh -c "
  apk add --no-cache openssl >/dev/null &&
  mkdir -p '$CERT_PATH' &&
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '$CERT_PATH/privkey.pem' \
    -out '$CERT_PATH/fullchain.pem' \
    -subj '/CN=localhost'
"

echo "==> starting nginx with the dummy certificate"
"${COMPOSE[@]}" up -d frontend

echo "==> deleting the dummy certificate"
docker run --rm -v "$CERT_VOLUME":/etc/letsencrypt alpine rm -rf "$CERT_PATH"

echo "==> requesting the real certificate from Let's Encrypt"
"${COMPOSE[@]}" run --rm --entrypoint "certbot certonly --webroot -w /var/www/certbot --email $CERTBOT_EMAIL -d $DOMAIN --rsa-key-size 2048 --agree-tos --no-eff-email" certbot

echo "==> reloading nginx with the real certificate"
"${COMPOSE[@]}" exec frontend nginx -s reload

echo "==> starting the rest of the stack"
"${COMPOSE[@]}" up -d

echo "==> done. https://$DOMAIN should now serve a real certificate."
