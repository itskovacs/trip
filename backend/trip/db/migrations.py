import logging
from pathlib import Path

from sqlmodel import Session, select

from ..config import get_settings
from ..models.models import Image
from ..utils.utils import backup_file

logger = logging.getLogger(__name__)


def _001_image_file_size(session: Session):
    images = session.exec(select(Image).where((Image.file_size.is_(None)) | (Image.file_size == 0))).all()
    if not images:
        return

    dst = backup_file(Path(get_settings().SQLITE_FILE))
    logger.warn(f"[Migration] Database backed up to {dst} before changes")

    assets = Path(get_settings().ASSETS_FOLDER)
    for image in images:
        path = assets / image.filename
        image.file_size = path.stat().st_size if path.exists() else 0
        session.add(image)
    session.commit()
    logger.warn(f"[Migration 001_image_file_size]: Computed {len(images)} file_size property")


def run_migrations(session: Session):
    _001_image_file_size(session)
