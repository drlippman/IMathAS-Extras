#!/bin/bash
# Setup for the "extras" server (Apache + PHP + pandoc, livepoll, mathsvg4) on Amazon Linux 2023.
# Run as root (sudo al2023-setup.sh)
#
# Optional environment variables:
#   DOMAIN  - hostname for the Let's Encrypt cert (DNS must already point at this server).
#             If unset, the certbot / livepoll-cert steps are skipped.
#   EMAIL   - contact email for Let's Encrypt (required when DOMAIN is set)
#   DNS_PLUGIN - certbot DNS plugin used for the DNS-01 challenge (e.g. cloudflare, route53,
#             digitalocean, google). Lets the cert be issued, and renewed unattended, while DOMAIN
#             still points at the old server. If blank (default), the HTTP-01 challenge via Apache
#             is used instead, which requires DOMAIN to already point at this server. For route53 the instance needs an IAM role
#             allowing route53:ListHostedZones, route53:GetChange and route53:ChangeResourceRecordSets.
#   DNS_CREDENTIALS - path to the plugin's credentials file (not needed for route53 with an IAM role)
#   LIVEPOLL_PASSWORD - shared secret for livepoll (must match the IMathAS config). Stored in a
#             root-only systemd drop-in. If empty, a random one is generated and printed at the end.
#
# When run from an interactive terminal, any of these not already set are prompted for.

set -euxo pipefail

export HOME=/root   # user-data runs without HOME, which npm/pip can trip over

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
LIVEPOLL_PASSWORD="${LIVEPOLL_PASSWORD:-}"
DNS_PLUGIN="${DNS_PLUGIN:-}"
DNS_CREDENTIALS="${DNS_CREDENTIALS:-}"

PROMPT_IN=""
if [ -t 0 ]; then PROMPT_IN=/dev/stdin
elif { : < /dev/tty; } 2>/dev/null; then PROMPT_IN=/dev/tty; fi

if [ -n "$PROMPT_IN" ]; then
  set +x   # keep the password out of the trace
  if [ -z "$DOMAIN" ]; then
    read -r -p "Domain for Let's Encrypt cert (blank to skip certbot): " DOMAIN < "$PROMPT_IN"
  fi
  if [ -n "$DOMAIN" ] && [ -z "$EMAIL" ]; then
    read -r -p "Contact email for Let's Encrypt: " EMAIL < "$PROMPT_IN"
  fi
  if [ -z "$LIVEPOLL_PASSWORD" ]; then
    read -r -s -p "Livepoll password (blank to generate a random one): " LIVEPOLL_PASSWORD < "$PROMPT_IN"
    echo
  fi
  set -x
fi

if [ -z "$LIVEPOLL_PASSWORD" ]; then
  LIVEPOLL_PASSWORD=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
  GENERATED_PASSWORD=1
fi

REPO_URL="https://github.com/drlippman/imathas-extras.git"
LIVEPOLL_DIR=/opt/livepoll
MATHSVG_DIR=/opt/mathsvg
SVC_USER=extras

# ---------------------------------------------------------------- base packages
dnf upgrade -y
dnf install -y httpd mod_ssl php8.5 php8.5-fpm php8.5-gd \
    git tar gzip cronie cronie-anacron python3-pip augeas-libs \
    gcc python3-devel augeas-devel libxml2-devel
dnf install -y nodejs24 nodejs24-npm || dnf install -y nodejs npm

systemctl enable --now httpd
systemctl enable --now php-fpm
systemctl enable --now crond

# ---------------------------------------------------------------- pandoc (latest release tarball)
case "$(uname -m)" in
  aarch64) PANDOC_ARCH=linux-arm64 ;;
  x86_64)  PANDOC_ARCH=linux-amd64 ;;
  *) echo "Unsupported architecture"; exit 1 ;;
esac
PANDOC_URL=$(curl -fsSL https://api.github.com/repos/jgm/pandoc/releases/latest \
  | grep -o "https://[^\"]*${PANDOC_ARCH}\.tar\.gz" | head -n1)
curl -fsSL -o /tmp/pandoc.tar.gz "$PANDOC_URL"
tar xzf /tmp/pandoc.tar.gz --strip-components=1 -C /usr/local
rm -f /tmp/pandoc.tar.gz
/usr/local/bin/pandoc --version | head -n1

# ---------------------------------------------------------------- fetch imathas-extras
rm -rf /tmp/imathas-extras
git clone --depth 1 "$REPO_URL" /tmp/imathas-extras

# pandoc server files -> /var/www/html
cp -r /tmp/imathas-extras/pandoc/. /var/www/html/
chmod 755 /var/www/html/pagebreak.php   # pandoc runs it as a filter; git stores it non-executable

# html2docx.php was written for Ubuntu and calls /usr/bin/pandoc
ln -sf /usr/local/bin/pandoc /usr/bin/pandoc

# name-based vhost on :80 so certbot --apache can find and upgrade it
if [ -n "$DOMAIN" ]; then
  cat > /etc/httpd/conf.d/extras-vhost.conf <<EOF
<VirtualHost *:80>
    ServerName ${DOMAIN}
    DocumentRoot /var/www/html
</VirtualHost>
EOF
  apachectl configtest
  systemctl reload httpd
fi
mkdir -p /var/www/html/imgs /var/www/datatmp
chown apache:apache /var/www/html/imgs /var/www/datatmp
chmod 755 /var/www/html/imgs /var/www/datatmp

# daily cleanup job
cat > /etc/cron.daily/cleanup-old-files <<'EOF'
#!/bin/sh
find /var/www/datatmp -mindepth 1 -type f -mtime +1 -delete
find /var/www/html/imgs -mindepth 1 -type f -mtime +1 -delete
EOF
chmod 755 /etc/cron.daily/cleanup-old-files

# ---------------------------------------------------------------- service user
id "$SVC_USER" &>/dev/null || useradd --system --shell /sbin/nologin --home-dir /nonexistent "$SVC_USER"

# ---------------------------------------------------------------- certbot (pip in a venv, per AWS guidance for AL2023)
python3 -m venv /opt/certbot
/opt/certbot/bin/pip install --upgrade pip
/opt/certbot/bin/pip install certbot certbot-apache ${DNS_PLUGIN:+"certbot-dns-${DNS_PLUGIN}"}
ln -sf /opt/certbot/bin/certbot /usr/bin/certbot

# auto-renew twice daily
cat > /etc/cron.d/certbot-renew <<'EOF'
0 3,15 * * * root /opt/certbot/bin/certbot renew -q
EOF

# ---------------------------------------------------------------- mathsvg4
mkdir -p "$MATHSVG_DIR"
cp /tmp/imathas-extras/mathsvg4/index.js /tmp/imathas-extras/mathsvg4/package.json "$MATHSVG_DIR"/
(cd "$MATHSVG_DIR" && npm install --omit=dev)
chown -R "$SVC_USER":"$SVC_USER" "$MATHSVG_DIR"

NODE_BIN=$(command -v node)

install_service() {
  # $1 = source unit file, $2 = name, $3 = install dir
  local src="$1" name="$2" dir="$3"
  cp "$src" "/etc/systemd/system/${name}.service"
  # point ExecStart at this machine's node binary and the install dir
  sed -i -E "s|^ExecStart=.*|ExecStart=${NODE_BIN} ${dir}/index.js|" "/etc/systemd/system/${name}.service"
  if grep -q '^User=' "/etc/systemd/system/${name}.service"; then
    sed -i -E "s|^User=.*|User=${SVC_USER}|" "/etc/systemd/system/${name}.service"
  fi
  if grep -q '^WorkingDirectory=' "/etc/systemd/system/${name}.service"; then
    sed -i -E "s|^WorkingDirectory=.*|WorkingDirectory=${dir}|" "/etc/systemd/system/${name}.service"
  fi
}

install_service /tmp/imathas-extras/mathsvg/mathsvg.service mathsvg "$MATHSVG_DIR"

# ---------------------------------------------------------------- apache proxy for mathsvg
# mod_proxy, mod_proxy_http, mod_headers are loaded by default on AL2023; mod_ssl was installed above.
cat > /etc/httpd/conf.d/extras-proxy.conf <<'EOF'
ProxyPreserveHost On
ProxyRequests Off
ProxyPass        /mathsvg/  http://127.0.0.1:3001/
ProxyPassReverse /mathsvg/  http://127.0.0.1:3001/
EOF
apachectl configtest
systemctl reload httpd

# ---------------------------------------------------------------- livepoll
mkdir -p "$LIVEPOLL_DIR/certs"
cp /tmp/imathas-extras/livepoll/index.js /tmp/imathas-extras/livepoll/package.json "$LIVEPOLL_DIR"/
(cd "$LIVEPOLL_DIR" && npm install --omit=dev)

install_service /tmp/imathas-extras/livepoll/livepoll.service livepoll "$LIVEPOLL_DIR"

# index.js reads LIVEPOLL_PASSWORD from the environment. Keep it in a root-only drop-in
# (the main unit file is world-readable). systemd reads it as root, so the service user can't read the file.
set +x
mkdir -p /etc/systemd/system/livepoll.service.d
umask 077
printf '[Service]\nEnvironment="LIVEPOLL_PASSWORD=%s"\n' "$LIVEPOLL_PASSWORD" \
  > /etc/systemd/system/livepoll.service.d/password.conf
umask 022
chmod 600 /etc/systemd/system/livepoll.service.d/password.conf
set -x

# deploy hook: copies renewed certs into livepoll/certs
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cp /tmp/imathas-extras/livepoll/livepoll.sh /etc/letsencrypt/renewal-hooks/deploy/livepoll.sh
sed -i -E "s|^livepoll_cert_root=.*|livepoll_cert_root=${LIVEPOLL_DIR}/certs|" /etc/letsencrypt/renewal-hooks/deploy/livepoll.sh
chmod a+x /etc/letsencrypt/renewal-hooks/deploy/livepoll.sh

chown -R "$SVC_USER":"$SVC_USER" "$LIVEPOLL_DIR"

# ---------------------------------------------------------------- certificate
if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  if [ -n "$DNS_PLUGIN" ]; then
    # DNS-01 validation: works before DOMAIN points here, and the authenticator is saved in
    # /etc/letsencrypt/renewal/${DOMAIN}.conf so the cron renewal needs no intervention.
    CERTBOT_DNS_ARGS=(-a "dns-${DNS_PLUGIN}" -i apache)
    if [ -n "$DNS_CREDENTIALS" ]; then
      CERTBOT_DNS_ARGS+=("--dns-${DNS_PLUGIN}-credentials" "$DNS_CREDENTIALS")
    fi
    certbot run "${CERTBOT_DNS_ARGS[@]}" -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email -n
  else
    certbot --apache -d "$DOMAIN" -m "$EMAIL" --agree-tos --no-eff-email -n
  fi
  # first-time copy (renewals are handled by the deploy hook)
  cp -L "/etc/letsencrypt/live/${DOMAIN}/"*.pem "$LIVEPOLL_DIR/certs/"
  chmod a+r "$LIVEPOLL_DIR/certs/"*.pem
  chown "$SVC_USER":"$SVC_USER" "$LIVEPOLL_DIR/certs/"*.pem
else
  echo "DOMAIN/EMAIL not set: skipping certbot. Run it later, then copy the certs into ${LIVEPOLL_DIR}/certs and chmod a+r them."
fi

# ---------------------------------------------------------------- start services
systemctl daemon-reload
systemctl enable --now mathsvg
systemctl enable livepoll
if [ -n "$DOMAIN" ] && [ -n "$EMAIL" ]; then
  systemctl start livepoll
else
  echo "livepoll enabled but not started (needs certs first): sudo systemctl start livepoll"
fi

# -------------------------------------------------------------- enable auto updates
dnf install -y dnf-automatic

# Apply all available updates (use "security" to limit to security fixes only)
sed -i 's/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
sed -i 's/^upgrade_type.*/upgrade_type = default/' /etc/dnf/automatic.conf

# Run the install timer (download + apply) daily
systemctl enable --now dnf-automatic-install.timer

# Set update time; is UTC time by default
mkdir -p /etc/systemd/system/dnf-automatic-install.timer.d
cat > /etc/systemd/system/dnf-automatic-install.timer.d/override.conf <<'EOF'
[Timer]
OnCalendar=
OnCalendar=*-*-* 10:00
RandomizedDelaySec=0
Persistent=true
EOF
systemctl daemon-reload
systemctl restart dnf-automatic-install.timer

# Reboot if needed after updates
dnf install -y dnf-utils
cat > /etc/cron.d/reboot-if-needed <<'EOF'
30 10 * * * root needs-restarting -r >/dev/null || /sbin/shutdown -r now
EOF

# -------------------------------------------------------------- clean up
rm -rf /tmp/imathas-extras
set +x
if [ -n "${GENERATED_PASSWORD:-}" ]; then
  echo "Generated livepoll password (set this in IMathAS too): ${LIVEPOLL_PASSWORD}"
fi
echo "Done. Open ports 80, 443 and 8443 (livepoll; also 3000 if you use it) in the EC2 security group."