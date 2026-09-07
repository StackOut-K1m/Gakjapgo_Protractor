#!/bin/bash -x
set -e

KMS_STUN_IP_AUX="stun.l.google.com"
KMS_STUN_PORT_AUX="19302"

if [ -n "$KMS_STUN_IP" -a -n "$KMS_STUN_PORT" ]; then
    KMS_STUN_IP_AUX="${KMS_STUN_IP}"
    KMS_STUN_PORT_AUX="${KMS_STUN_PORT}"
fi

echo "stunServerAddress=$KMS_STUN_IP_AUX" > /etc/kurento/modules/kurento/WebRtcEndpoint.conf.ini
echo "stunServerPort=$KMS_STUN_PORT_AUX" >> /etc/kurento/modules/kurento/WebRtcEndpoint.conf.ini
if [ -n "$KMS_TURN_URL" ]; then
    echo "turnURL=$KMS_TURN_URL" >> /etc/kurento/modules/kurento/WebRtcEndpoint.conf.ini
fi
# NAT 뒤 공인 IP를 ICE 후보로 광고
if [ -n "$KMS_EXTERNAL_ADDRESS" ]; then
    echo "externalIPv4=$KMS_EXTERNAL_ADDRESS" >> /etc/kurento/modules/kurento/WebRtcEndpoint.conf.ini
fi

cat /etc/hosts | sed '/::1/d' | tee /etc/hosts > /dev/null
export GST_DEBUG=Kurento*:5
exec /usr/bin/kurento-media-server "$@"
