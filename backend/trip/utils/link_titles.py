import asyncio
import html
import ipaddress
import logging
import re
import socket
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
_TIMEOUT = 2.0
_MAX_BYTES = 65536
_MAX_TITLE_LENGTH = 200
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; TRIP/1; +https://github.com/itskovacs/trip)",
    "Accept": "text/html,application/xhtml+xml",
}


def _is_safe_host(hostname: str) -> bool:
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        return False

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    return True


async def _is_safe_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return False
    return await asyncio.to_thread(_is_safe_host, parsed.hostname)


async def fetch_link_title(url: str) -> str | None:
    if not await _is_safe_url(url):
        return None

    try:
        async with httpx.AsyncClient(
            follow_redirects=True, headers=_HEADERS, timeout=_TIMEOUT, max_redirects=5
        ) as client:
            async with client.stream("GET", url) as response:
                if response.status_code >= 400:
                    return None
                # Re-validate post-redirect: the initial host check doesn't cover
                # a redirect landing on a private/internal address.
                if not await _is_safe_url(str(response.url)):
                    return None
                content_type = response.headers.get("Content-Type", "")
                if "text/html" not in content_type:
                    return None

                body = b""
                async for chunk in response.aiter_bytes():
                    body += chunk
                    if len(body) >= _MAX_BYTES:
                        break
    except Exception as exc:
        logger.info(f"[LINK TITLE] Fetch failed for {url}: {exc}")
        return None

    match = _TITLE_RE.search(body.decode("utf-8", errors="ignore"))
    if not match:
        return None

    title = _TAG_RE.sub("", match.group(1))
    title = html.unescape(title)
    title = _WHITESPACE_RE.sub(" ", title).strip()
    return title[:_MAX_TITLE_LENGTH] if title else None


async def resolve_links(
    old_links: list | None, new_links: list[str] | None, fetch: bool
) -> list[str | dict] | None:
    if not new_links:
        return new_links

    cached_titles: dict[str, str] = {}
    for entry in old_links or []:
        if isinstance(entry, dict) and entry.get("url") and entry.get("title"):
            cached_titles[entry["url"]] = entry["title"]

    to_fetch = list(dict.fromkeys(url for url in new_links if url not in cached_titles)) if fetch else []
    fetched: dict[str, str | None] = {}
    if to_fetch:
        results = await asyncio.gather(*(fetch_link_title(url) for url in to_fetch))
        fetched = dict(zip(to_fetch, results))

    resolved: list[str | dict] = []
    for url in new_links:
        title = cached_titles.get(url) or fetched.get(url)
        resolved.append({"url": url, "title": title} if title else url)
    return resolved
