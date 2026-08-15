import asyncio
import logging
from datetime import datetime

import apprise
from sqlmodel import Session, select

from .db.core import get_engine
from .models.models import (Trip, TripChecklist, TripChecklistEntry,
                            TripChecklistItem, TripMember, User)
from .utils.date import dt_utc

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 60


def _seconds_until_next_tick(now: datetime) -> float:
    epoch = now.timestamp()
    return (epoch // CHECK_INTERVAL_SECONDS + 1) * CHECK_INTERVAL_SECONDS - epoch


def _send_notification(webhook_url: str, title: str, body: str) -> None:
    try:
        client = apprise.Apprise()
        if not client.add(webhook_url):
            logger.warning("Invalid apprise webhook URL, skipping notification")
            return
        if not client.notify(title=title, body=body):
            logger.warning("Apprise notification failed to send")
    except Exception:
        logger.exception("Error sending apprise notification")


def _due_items(session: Session, since: datetime, until: datetime):
    return session.exec(
        select(TripChecklistItem, Trip)
        .join(Trip, Trip.id == TripChecklistItem.trip_id)
        .where(TripChecklistItem.notify_dt > since)
        .where(TripChecklistItem.notify_dt <= until)
        .where(TripChecklistItem.checked.is_not(True))
    ).all()


def _due_entries(session: Session, since: datetime, until: datetime):
    return session.exec(
        select(TripChecklistEntry, Trip)
        .join(TripChecklist, TripChecklist.id == TripChecklistEntry.checklist_id)
        .join(Trip, Trip.id == TripChecklist.trip_id)
        .where(TripChecklistEntry.notify_dt > since)
        .where(TripChecklistEntry.notify_dt <= until)
        .where(TripChecklistEntry.checked.is_not(True))
    ).all()


def run_due_notifications(since: datetime, until: datetime) -> None:
    with Session(get_engine()) as session:
        due = list(_due_items(session, since, until)) + list(_due_entries(session, since, until))
        if not due:
            return

        trip_ids = {trip.id for _, trip in due}
        members = session.exec(
            select(TripMember.trip_id, TripMember.user).where(
                TripMember.trip_id.in_(trip_ids), TripMember.joined_at.is_not(None)
            )
        ).all()
        recipients_by_trip: dict[int, set[str]] = {}
        for trip_id, member in members:
            recipients_by_trip.setdefault(trip_id, set()).add(member)
        for _, trip in due:
            recipients_by_trip.setdefault(trip.id, set()).add(trip.user)

        usernames = {u for recipients in recipients_by_trip.values() for u in recipients}
        users = {u.username: u for u in session.exec(select(User).where(User.username.in_(usernames))).all()}

        for item, trip in due:
            for username in recipients_by_trip.get(trip.id, ()):
                user = users.get(username)
                if not user or not user.apprise_webhook_url:
                    continue
                _send_notification(
                    user.apprise_webhook_url,
                    f"{trip.name}",
                    f"**{item.text}** _(due {item.notify_dt.strftime('%Y-%m-%d %H:%M')})_",
                )


async def notify_loop() -> None:
    last_checked = dt_utc()
    while True:
        await asyncio.sleep(_seconds_until_next_tick(dt_utc()))
        now = dt_utc()
        try:
            await asyncio.to_thread(run_due_notifications, last_checked, now)
        except Exception:
            logger.exception("Error running due notifications")
        last_checked = now
