import asyncio
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, create_engine

from ..config import settings
from ..models.models import Category

_engine = None


def _db_needs_stamp(engine: Engine) -> bool:
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='alembic_version';")
        )
        return result.fetchone() is None


def get_engine():
    global _engine
    if not _engine:
        _engine = create_engine(
            f"sqlite:///{settings.SQLITE_FILE}",
            connect_args={"check_same_thread": False},
        )
    return _engine


@event.listens_for(Engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


async def init_and_migrate_db():
    alembic_cfg = Config("alembic.ini")
    sqlite_file = Path(settings.SQLITE_FILE)
    engine = get_engine()

    if not sqlite_file.exists():
        # DB does not exist, upgrade to head
        await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
        return

    if _db_needs_stamp(engine):
        # DB exists, but Alembic not initialized, we stamp
        # b2ed4bf9c1b2 is the revision before Alembic introduction
        await asyncio.to_thread(command.stamp, alembic_cfg, "b2ed4bf9c1b2")

    # Alembic already introdcued, classic upgrade
    await asyncio.to_thread(command.upgrade, alembic_cfg, "head")
    return


def init_user_data(session: Session, username: str):
    data = [
        {"category": {"user": username, "name": "Nature & Outdoor"}},
        {"category": {"user": username, "name": "Entertainment & Leisure"}},
        {"category": {"user": username, "name": "Culture"}},
        {"category": {"user": username, "name": "Food & Drink"}},
        {"category": {"user": username, "name": "Adventure & Sports"}},
        {"category": {"user": username, "name": "Festival & Event"}},
        {"category": {"user": username, "name": "Wellness"}},
        {"category": {"user": username, "name": "Accommodation"}},
    ]

    for element in data:
        category = Category(**element["category"])
        session.add(category)
    session.commit()
