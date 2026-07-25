import html
import logging
import re

import defusedxml.ElementTree as ET

logger = logging.getLogger(__name__)

_BLOCK_NEWLINE_RE = re.compile(r"<\s*br\s*/?\s*>|</\s*(p|div|tr|li|h[1-6])\s*>", re.IGNORECASE)
_BLOCK_SPACE_RE = re.compile(r"</\s*td\s*>", re.IGNORECASE)
_TAG_RE = re.compile(r"<[^>]+>")
_MULTI_SPACE_RE = re.compile(r"[ \t]{2,}")
_MULTI_BLANK_LINE_RE = re.compile(r"\n{3,}")


def _html_to_text(raw: str) -> str:
    text = _BLOCK_NEWLINE_RE.sub("\n", raw)
    text = _BLOCK_SPACE_RE.sub(" ", text)
    text = _TAG_RE.sub(" ", text)
    text = html.unescape(text)

    lines = [line.strip() for line in text.splitlines()]
    text = "\n".join(lines)
    text = _MULTI_SPACE_RE.sub(" ", text)
    text = _MULTI_BLANK_LINE_RE.sub("\n\n", text)
    return text.strip()


def parse_mymaps_kml(kml_content: str):
    root = ET.fromstring(kml_content)
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    results = []
    for placemark in root.findall(".//kml:Placemark", ns):
        try:
            name_elem = placemark.find("kml:name", ns)
            if name_elem is None or not name_elem.text:
                continue

            name = name_elem.text
            description_elem = placemark.find("kml:description", ns)
            description_raw = description_elem.text if description_elem is not None else None
            description = _html_to_text(description_raw) if description_raw else None

            point_elem = placemark.find(".//kml:Point/kml:coordinates", ns)
            if point_elem is not None and point_elem.text:
                coords_text = point_elem.text.strip()
                parts = coords_text.split(",")
                if len(parts) < 2:
                    logger.warning(
                        f"[KML PARSE]: Skipping placemark {name!r}: malformed coordinates {coords_text!r}"
                    )
                    continue
                lng, lat = parts[:2]
                entry = {"name": name, "lat": lat, "lng": lng}
                if description:
                    entry["description"] = description
                results.append(entry)
            elif description_raw:
                url_match = re.search(r'https://[^\s<>"]+', description_raw)
                if url_match:
                    entry = {"name": name, "url": url_match.group(0)}
                    if description:
                        entry["description"] = description
                    results.append(entry)
        except Exception as exc:
            logger.warning(f"[KML PARSE]: Skipping malformed placemark: {exc}")
            continue

    return results
