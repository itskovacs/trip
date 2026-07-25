import logging
from collections.abc import Callable
from pathlib import Path

from sqlmodel import Session, select

from ..config import get_settings
from ..models.models import (Backup, BackupStatus, DataMigration, Image,
                             TripItem, TripItemImageLink, User)
from ..utils.utils import backup_file

logger = logging.getLogger(__name__)


def _005_reap_stuck_backups(session: Session):
    stuck_backups = session.exec(
        select(Backup).where(Backup.status.in_([BackupStatus.PENDING, BackupStatus.PROCESSING]))
    ).all()
    if not stuck_backups:
        return

    for backup in stuck_backups:
        backup.status = BackupStatus.FAILED
        backup.error_message = "Backup was interrupted by a server restart"
        session.add(backup)
    session.commit()
    logger.warning(
        f"[Migration 005_reap_stuck_backups] Marked {len(stuck_backups)} stuck backup(s) as failed"
    )


def _004_bootstrap_admin_from_env(session: Session):
    username = get_settings().BOOTSTRAP_ADMIN_USERNAME
    if not username:
        return

    has_admin = session.exec(select(User).where(User.is_admin)).first()
    if has_admin:
        return

    user = session.get(User, username)
    if not user:
        logger.error(
            f"[Migration 004_bootstrap_admin_from_env] BOOTSTRAP_ADMIN_USERNAME={username!r} "
            "does not match any existing user"
        )
        return

    dst = backup_file(Path(get_settings().SQLITE_FILE))
    logger.warning(f"[Migration 004_bootstrap_admin_from_env] Database backed up to {dst} before changes")

    user.is_admin = True
    session.add(user)
    session.commit()
    logger.warning(
        f"[Migration 004_bootstrap_admin_from_env] Made {user.username} admin via BOOTSTRAP_ADMIN_USERNAME"
    )


def _003_set_admin_for_single_user(session: Session):
    users = session.exec(select(User)).all()
    if len(users) != 1:
        return

    user = users[0]
    if user.is_admin:
        return

    dst = backup_file(Path(get_settings().SQLITE_FILE))
    logger.warning(f"[Migration 003_set_admin_for_single_user] Database backed up to {dst} before changes")

    user.is_admin = True
    session.add(user)
    session.commit()
    logger.warning(f"[Migration 003_set_admin_for_single_user] Made {user.username} admin")


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
        logger.warning(f"[Migration 002_remove_orphan_image] Removed {orphans} orphan images")


def _006_backfill_tripitem_images(session: Session):
    items = session.exec(select(TripItem).where(TripItem.image_id.is_not(None))).all()
    if not items:
        return

    created = 0
    for item in items:
        if session.get(TripItemImageLink, (item.id, item.image_id)):
            continue
        session.add(TripItemImageLink(item_id=item.id, image_id=item.image_id))
        created += 1

    if created:
        session.commit()
        logger.warning(
            f"[Migration 006_backfill_tripitem_images] Linked {created} cover image(s) into galleries"
        )


def _001_image_file_size(session: Session):
    images = session.exec(select(Image).where((Image.file_size.is_(None)) | (Image.file_size == 0))).all()
    if not images:
        return

    dst = backup_file(Path(get_settings().SQLITE_FILE))
    logger.warning(f"[Migration 001_image_file_size] Database backed up to {dst} before changes")

    assets = Path(get_settings().ASSETS_FOLDER)
    for image in images:
        path = assets / image.filename
        image.file_size = path.stat().st_size if path.exists() else 0
        session.add(image)
    session.commit()
    logger.warning(f"[Migration 001_image_file_size] Computed {len(images)} file_size property")


# True one-time historical backfills. Each is gated behind the DataMigration marker
# table so it runs at most once, ever, per database.
_ONCE_MIGRATIONS: list[tuple[str, Callable[[Session], None]]] = [
    ("001_image_file_size", _001_image_file_size),
    ("006_backfill_tripitem_images", _006_backfill_tripitem_images),
]


def run_migrations(session: Session):
    for name, migration in _ONCE_MIGRATIONS:
        if session.get(DataMigration, name):
            continue
        migration(session)
        session.add(DataMigration(name=name))
        session.commit()

    # Ongoing invariant enforcers: the conditions they guard against can recur at any
    # time, so they must run unconditionally on every boot - NOT gated behind the
    # DataMigration marker table.
    _002_remove_orphan_image(session)
    _003_set_admin_for_single_user(session)
    _004_bootstrap_admin_from_env(session)
    _005_reap_stuck_backups(session)
