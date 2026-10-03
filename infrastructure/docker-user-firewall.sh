#!/bin/sh
set -eu

CHAIN=COMMUNITY-CHAT-INGRESS

iptables -N "$CHAIN" 2>/dev/null || true
iptables -F "$CHAIN"

# Preserve replies and traffic between Docker bridge networks; only traffic
# arriving from a public interface is checked against the published-port list.
iptables -A "$CHAIN" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A "$CHAIN" -i lo -j ACCEPT
iptables -A "$CHAIN" -i docker0 -j ACCEPT
iptables -A "$CHAIN" -i br+ -j ACCEPT

iptables -A "$CHAIN" -p tcp -m conntrack --ctorigdstport 80 -j ACCEPT
iptables -A "$CHAIN" -p tcp -m conntrack --ctorigdstport 443 -j ACCEPT
iptables -A "$CHAIN" -p tcp -m conntrack --ctorigdstport 8443 -j ACCEPT
iptables -A "$CHAIN" -p tcp -m conntrack --ctorigdstport 7881 -j ACCEPT
iptables -A "$CHAIN" -p udp -m conntrack --ctorigdstport 7882 -j ACCEPT
iptables -A "$CHAIN" -j DROP

iptables -C DOCKER-USER -j "$CHAIN" 2>/dev/null || iptables -I DOCKER-USER 1 -j "$CHAIN"
