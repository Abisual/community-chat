#!/bin/sh
set -eu

DEPLOY_DIR=/opt/community-chat
ENV_FILE=/etc/community-chat/production.env
BASE_COMPOSE="$DEPLOY_DIR/infrastructure/docker-compose.yml"
PRODUCTION_COMPOSE="$DEPLOY_DIR/infrastructure/docker-compose.production.yml"
CERTBOT_IMAGE=certbot/certbot:v5.8.0

PUBLIC_IP=$(awk -F= '$1 == "PUBLIC_IP" { print $2; exit }' "$ENV_FILE")
CERT_FILE="/etc/letsencrypt/live/$PUBLIC_IP/fullchain.pem"

compose() {
	docker compose -p community-chat --env-file "$ENV_FILE" -f "$BASE_COMPOSE" -f "$PRODUCTION_COMPOSE" "$@"
}

if [ -z "$PUBLIC_IP" ] || [ ! -r "$CERT_FILE" ]; then
	echo "Production IP certificate or PUBLIC_IP configuration is missing" >&2
	exit 1
fi

# Let's Encrypt IP certificates last about 6 days. Renew only once the
# certificate has less than 24 hours remaining; Certbot then uses its saved
# standalone HTTP-01 authenticator on port 80.
if openssl x509 -checkend 86400 -noout -in "$CERT_FILE" >/dev/null 2>&1; then
	exit 0
fi

compose stop caddy
restart_proxy() {
	compose start caddy >/dev/null 2>&1 || true
}
trap restart_proxy EXIT HUP INT TERM

docker run --rm \
	-p 80:80/tcp \
	-v /etc/letsencrypt:/etc/letsencrypt \
	-v /var/lib/letsencrypt:/var/lib/letsencrypt \
	-v /var/log/letsencrypt:/var/log/letsencrypt \
	"$CERTBOT_IMAGE" renew --non-interactive

compose start caddy
trap - EXIT HUP INT TERM
