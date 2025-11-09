from datetime import UTC, date, datetime, timedelta


def dt_utc() -> datetime:
    return datetime.now(UTC)


def dt_utc_offset(min: int) -> datetime:
    return datetime.now(UTC) + timedelta(minutes=min)


def iso_to_dt(str: str) -> date:
    return datetime.fromisoformat(str).date()
