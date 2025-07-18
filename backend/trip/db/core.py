from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from ..config import settings
from ..models.models import Category, Image

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
        {
            "image": {"filename": "nature.png", "user": username},
            "category": {"user": username, "name": "Nature & Outdoor"},
        },
        {
            "image": {"filename": "entertainment.png", "user": username},
            "category": {"user": username, "name": "Entertainment & Leisure"},
        },
        {
            "image": {"filename": "culture.png", "user": username},
            "category": {"user": username, "name": "Culture"},
        },
        {
            "image": {"filename": "food.png", "user": username},
            "category": {"user": username, "name": "Food & Drink"},
        },
        {
            "image": {"filename": "adventure.png", "user": username},
            "category": {"user": username, "name": "Adventure & Sports"},
        },
        {
            "image": {"filename": "event.png", "user": username},
            "category": {"user": username, "name": "Festival & Event"},
        },
        {
            "image": {"filename": "wellness.png", "user": username},
            "category": {"user": username, "name": "Wellness"},
        },
        {
            "image": {"filename": "accommodation.png", "user": username},
            "category": {"user": username, "name": "Accommodation"},
        },
    ]

    for element in data:
        img = Image(**element["image"])
        session.add(img)
        session.flush()

        category = Category(**element["category"], image_id=img.id)
        session.add(category)
    session.commit()
