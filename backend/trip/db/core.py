from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from ..config import settings
from ..models.models import Category

_engine = None


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


def init_db():
    engine = get_engine()
    SQLModel.metadata.create_all(engine)


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
