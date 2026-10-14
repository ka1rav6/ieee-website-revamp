"""Client-address resolution and the reverse-proxy trust boundary.

`X-Forwarded-For` is attacker-controlled, so it must only be believed when the
request arrived from a proxy the operator has explicitly trusted. These tests
pin that boundary down at the unit level; the endpoint-level rate-limit test
lives in test_contact.py.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.core import deps
from app.core.config import Settings, settings


def _request(client_host: str | None, *, xff: str | None = None) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if xff is not None:
        headers.append((b"x-forwarded-for", xff.encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "headers": headers,
        "client": (client_host, 12345) if client_host is not None else None,
    }
    return Request(scope)


def test_the_socket_address_is_used_while_no_proxy_is_trusted(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "")
    request = _request("203.0.113.7", xff="9.9.9.9")

    assert deps.client_ip(request) == "203.0.113.7"


def test_a_forwarded_address_is_used_from_a_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.0/8")
    request = _request("10.0.0.5", xff="203.0.113.9, 10.0.0.5")

    # The left-most entry is the original client; the proxy appends itself.
    assert deps.client_ip(request) == "203.0.113.9"


def test_a_single_trusted_proxy_address_is_accepted(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "127.0.0.1")
    request = _request("127.0.0.1", xff="198.51.100.4")

    assert deps.client_ip(request) == "198.51.100.4"


def test_a_forwarded_address_from_an_untrusted_peer_is_ignored(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.0/8")
    request = _request("203.0.113.7", xff="9.9.9.9")

    assert deps.client_ip(request) == "203.0.113.7"


def test_an_ipv6_trusted_proxy_is_supported(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "::1")
    request = _request("::1", xff="2001:db8::1")

    assert deps.client_ip(request) == "2001:db8::1"


def test_a_non_ip_forwarded_value_from_a_trusted_peer_falls_back(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.0/8")
    request = _request("10.0.0.5", xff="not-an-address")

    assert deps.client_ip(request) == "10.0.0.5"


def test_a_spoofed_forwarded_value_cannot_overflow_the_column(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.0/8")
    request = _request("10.0.0.5", xff="1" * 500)

    assert deps.client_ip(request) == "10.0.0.5"


def test_a_trusted_peer_with_no_header_uses_its_own_address(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "10.0.0.0/8")
    request = _request("10.0.0.5")

    assert deps.client_ip(request) == "10.0.0.5"


def test_a_missing_client_falls_back_to_unknown(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxies", "")
    request = _request(None, xff="9.9.9.9")

    assert deps.client_ip(request) == "unknown"


@pytest.mark.parametrize(
    "value", ["10.0.0.0/8", "127.0.0.1", "::1", "", "10.0.0.1, 192.168.0.0/16"]
)
def test_valid_trusted_proxy_configurations_are_accepted(value):
    assert Settings(trusted_proxies=value).trusted_proxies == value


@pytest.mark.parametrize("value", ["not-an-ip", "10.0.0.0/99", "999.1.1.1", "10.0.0.1, nope"])
def test_invalid_trusted_proxy_configurations_are_rejected(value):
    with pytest.raises(ValidationError):
        Settings(trusted_proxies=value)
