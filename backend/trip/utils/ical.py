import re
from bisect import bisect_right
from datetime import UTC, date, datetime, timedelta

from ..config import get_settings
from ..models.models import Trip, TripDay, TripItem

PRODID = "-//Trip//Trip Planner//EN"
UID_DOMAIN = "trip"
DEFAULT_DURATION = timedelta(hours=1)
MAX_AUTO_DURATION = timedelta(hours=3)
MAX_LINE_OCTETS = 75
REFRESH_INTERVAL = "PT1H"


def _escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "")
    )


def _fold(line: str) -> str:
    raw = line.encode("utf-8")
    if len(raw) <= MAX_LINE_OCTETS:
        return line

    chunks: list[str] = []
    start, limit = 0, MAX_LINE_OCTETS
    while start < len(raw):
        end = min(start + limit, len(raw))
        while end < len(raw) and (raw[end] & 0xC0) == 0x80:  # mid-char
            end -= 1
        chunks.append(raw[start:end].decode("utf-8"))
        start = end
        limit = MAX_LINE_OCTETS - 1  # continuation lines carry a leading space
    return "\r\n ".join(chunks)


def _parse_hhmm(value: str) -> tuple[int, int]:
    hh, _, mm = value.partition(":")
    return int(hh), int(mm or 0)


def _fmt_dt(value: datetime) -> str:
    return f"{value:%Y%m%dT%H%M%S}"


def _fmt_date(value: date) -> str:
    return f"{value:%Y%m%d}"


def _dtstamp() -> str:
    return f"{datetime.now(UTC):%Y%m%d}T000000Z"


def _item_lines(trip: Trip, day: TripDay, item: TripItem, next_time: str | None, currency: str) -> list[str]:
    lines = [
        "BEGIN:VEVENT",
        f"UID:trip-{trip.id}-item-{item.id}@{UID_DOMAIN}",
        f"DTSTAMP:{_dtstamp()}",
    ]

    if item.time:
        hh, mm = _parse_hhmm(item.time)
        start = datetime(day.dt.year, day.dt.month, day.dt.day, hh, mm)
        end = None
        if next_time:
            nhh, nmm = _parse_hhmm(next_time)
            candidate = datetime(day.dt.year, day.dt.month, day.dt.day, nhh, nmm)
            if start < candidate <= start + MAX_AUTO_DURATION:
                end = candidate
        # Times are floating (no TZID): the trip has no timezone, so "09:30"
        # renders as 09:30 wherever the viewer happens to be.
        lines.append(f"DTSTART:{_fmt_dt(start)}")
        lines.append(f"DTEND:{_fmt_dt(end or start + DEFAULT_DURATION)}")
    else:
        # All-day event; DTEND is exclusive so it lands on the following day.
        lines.append(f"DTSTART;VALUE=DATE:{_fmt_date(day.dt)}")
        lines.append(f"DTEND;VALUE=DATE:{_fmt_date(day.dt + timedelta(days=1))}")

    lat = item.lat if item.lat is not None else (item.place.lat if item.place else None)
    lng = item.lng if item.lng is not None else (item.place.lng if item.place else None)
    place_name = item.place.name if item.place else None

    description: list[str] = []
    if item.comment:
        description.append(item.comment)
    if place_name:
        description.append(place_name)
    if lat is not None and lng is not None:
        description.append(f"https://www.google.com/maps?q={lat},{lng}")
    if item.price:
        description.append(f"{item.price} {currency}")

    summary = item.text
    if item.status:
        summary = f"{summary} [{item.status.value.upper()}]"
    lines.append(f"SUMMARY:{_escape(summary)}")
    if description:
        lines.append("DESCRIPTION:" + _escape("\n".join(description)))

    location = place_name or (f"{lat}, {lng}" if lat is not None and lng is not None else None)
    if location:
        lines.append(f"LOCATION:{_escape(location)}")
    if lat is not None and lng is not None:
        lines.append(f"GEO:{lat};{lng}")

    lines.append("END:VEVENT")
    return lines


def build_trip_ics(trip: Trip) -> str:
    currency = trip.currency or get_settings().DEFAULT_CURRENCY
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        f"X-WR-CALNAME:{_escape(trip.name or 'Trip')}",
        f"REFRESH-INTERVAL;VALUE=DURATION:{REFRESH_INTERVAL}",
        f"X-PUBLISHED-TTL:{REFRESH_INTERVAL}",
    ]

    for day in trip.days:
        if not day.dt:
            continue
        times = sorted({item.time for item in day.items if item.time})
        for item in day.items:
            next_time = None
            if item.time:
                idx = bisect_right(times, item.time)
                next_time = times[idx] if idx < len(times) else None
            lines.extend(_item_lines(trip, day, item, next_time, currency))

    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def ics_filename(trip: Trip) -> str:
    safe = re.sub(r"[^A-Za-z0-9]+", "_", trip.name or "").strip("_")
    return f"{safe or 'trip'}.ics"
