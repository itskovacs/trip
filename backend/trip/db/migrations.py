import logging
from pathlib import Path

from sqlmodel import Session, select

from ..config import get_settings
from ..models.models import Image
from ..utils.utils import backup_file

logger = logging.getLogger(__name__)


def _002_remove_orphan_image(session: Session):
    images = session.exec(select(Image)).all()
    if not images:
        return

    db_image_filenames = {img.filename for img in images if img.filename}
    assets_dir = Path(get_settings().ASSETS_FOLDER)
    orphans = 0
    for fp in assets_dir.iterdir():
        if not fp.is_file():
            continue

        if fp.name not in db_image_filenames:
            try:
                fp.unlink()
                orphans += 1
            except Exception as exc:
                logger.error(
                    f"[Migration 002_remove_orphan_image] Error while removing orphan image {fp.name}. Error: {exc}"
                )

    if orphans:
        logger.warn(f"[Migration 002_remove_orphan_image] Removed {orphans} orphan images")


def _001_image_file_size(session: Session):
    images = session.exec(select(Image).where((Image.file_size.is_(None)) | (Image.file_size == 0))).all()
    if not images:
        return

    dst = backup_file(Path(get_settings().SQLITE_FILE))
    logger.warn(f"[Migration 001_image_file_size] Database backed up to {dst} before changes")

    assets = Path(get_settings().ASSETS_FOLDER)
    for image in images:
        path = assets / image.filename
        image.file_size = path.stat().st_size if path.exists() else 0
        session.add(image)
    session.commit()
    logger.warn(f"[Migration 001_image_file_size]: Computed {len(images)} file_size property")


def run_migrations(session: Session):
    _001_image_file_size(session)
    _002_remove_orphan_image(session)
