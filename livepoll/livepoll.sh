#!/bin/sh

set -e

livepoll_cert_root=/home/ubuntu/livepoll/certs
umask 077

cp "$RENEWED_LINEAGE/fullchain.pem" "$livepoll_cert_root/fullchain.pem"
cp "$RENEWED_LINEAGE/privkey.pem" "$livepoll_cert_root/privkey.pem"
cp "$RENEWED_LINEAGE/chain.pem" "$livepoll_cert_root/chain.pem"
chmod a+r $livepoll_cert_root/*.pem
systemctl restart livepoll >/dev/null
