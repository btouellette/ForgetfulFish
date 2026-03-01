#!/usr/bin/env python3
import json
import os
import sys
from typing import NoReturn
import urllib.error
import urllib.request


API_BASE = "https://api.gandi.net/v5/livedns"


def fail(message: str, code: int = 1) -> NoReturn:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(code)


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        fail(f"Missing required environment variable: {name}")
    return value


def request_json(method: str, url: str, token: str, payload: dict | None = None) -> tuple[int, dict]:
    body = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url=url, method=method, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status = response.getcode()
            raw = response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except Exception:
            data = {"raw": raw.decode("utf-8", errors="replace")}
        return exc.code, data
    except urllib.error.URLError as exc:
        fail(f"Request to {url} failed: {exc}")

    try:
        data = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception:
        data = {}
    return status, data


def get_public_ipv4(provider_url: str) -> str:
    req = urllib.request.Request(provider_url, headers={"Accept": "text/plain"})
    ip = ""
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            ip = response.read().decode("utf-8").strip()
    except Exception as exc:
        fail(f"Unable to fetch public IPv4 from {provider_url}: {exc}")

    parts = ip.split(".")
    if len(parts) != 4:
        fail(f"Invalid IPv4 from provider: {ip}")
    for p in parts:
        if not p.isdigit() or not 0 <= int(p) <= 255:
            fail(f"Invalid IPv4 from provider: {ip}")
    return ip


def update_record(domain: str, name: str, ipv4: str, ttl: int, token: str) -> None:
    payload = {"rrset_ttl": ttl, "rrset_values": [ipv4]}
    url = f"{API_BASE}/domains/{domain}/records/{name}/A"
    status, data = request_json("PUT", url, token, payload)
    if status not in (200, 201):
        fail(f"Failed to update {name}.A (HTTP {status}): {data}")
    print(f"Updated {name}.A -> {ipv4} ttl={ttl}")


def main() -> None:
    token = env("GANDI_PAT")
    domain = env("GANDI_DOMAIN")
    names_raw = env("GANDI_RECORDS", "@,staging,www")
    ttl_raw = env("GANDI_TTL", "300")
    ip_provider = env("IPV4_PROVIDER", "https://ifconfig.me/ip")

    try:
        ttl = 0
        ttl = int(ttl_raw)
    except ValueError:
        fail(f"GANDI_TTL must be an integer: {ttl_raw}")
    if ttl <= 0:
        fail("GANDI_TTL must be > 0")

    names = [n.strip() for n in names_raw.split(",") if n.strip()]
    if not names:
        fail("GANDI_RECORDS must include at least one record label")

    ipv4 = get_public_ipv4(ip_provider)
    print(f"Public IPv4: {ipv4}")

    for name in names:
        update_record(domain, name, ipv4, ttl, token)


if __name__ == "__main__":
    main()
