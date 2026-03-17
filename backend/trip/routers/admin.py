from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlmodel import func, select

from ..config import get_settings, update_config
from ..deps import SessionDep, require_admin
from ..models.models import (AdminUserRead, Backup, BackupRead, BackupStatus,
                             ConfigRead, ConfigUpdate, Image, MagicLink,
                             MagicLinkRead, Place, TempPasswordRead,
                             TripAttachment, User)
from ..security import hash_password
from ..utils.date import dt_utc, dt_utc_offset
from ..utils.utils import generate_urlsafe
from ..utils.zip import process_backup_export

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def _get_quotas(session: SessionDep) -> tuple[dict[str, int], dict[str, int]]:
    places_by_user: dict[str, int] = {
        username: count
        for username, count in session.exec(
            select(Place.user, func.count(Place.id)).group_by(Place.user)
        ).all()
    }

    image_storage: dict[str, int] = {
        username: total
        for username, total in session.exec(
            select(Image.user, func.coalesce(func.sum(Image.file_size), 0)).group_by(Image.user)
        ).all()
    }

    attachment_storage: dict[str, int] = {
        username: total
        for username, total in session.exec(
            select(
                TripAttachment.uploaded_by, func.coalesce(func.sum(TripAttachment.file_size), 0)
            ).group_by(TripAttachment.uploaded_by)
        ).all()
    }

    storage_by_user: dict[str, int] = {
        user: image_storage.get(user, 0) + attachment_storage.get(user, 0)
        for user in set(image_storage) | set(attachment_storage)
    }

    return places_by_user, storage_by_user


@router.get("/users", response_model=list[AdminUserRead])
def read_users(session: SessionDep) -> list[AdminUserRead]:
    users = session.exec(select(User)).all()
    places_user_map, storage_user_map = _get_quotas(session)
    return [
        AdminUserRead.serialize(
            obj=user,
            places_count=places_user_map.get(user.username, 0),
            storage_bytes=storage_user_map.get(user.username, 0),
        )
        for user in users
    ]


@router.get("/magic-link", response_model=list[MagicLinkRead])
def read_magic_links(
    session: SessionDep,
    current_user: Annotated[str, Depends(require_admin)],
) -> list[MagicLinkRead]:
    # we remove expired on retrieval
    db_magic_expired = session.exec(
        select(MagicLink).where(
            MagicLink.expires < dt_utc(),
            MagicLink.user == current_user,
        )
    ).all()
    if db_magic_expired:
        for token in db_magic_expired:
            session.delete(token)
        session.commit()
    db_links = session.exec(select(MagicLink).where(MagicLink.user == current_user)).all()
    return [MagicLinkRead.serialize(link) for link in db_links]


@router.post("/magic-link", response_model=MagicLinkRead)
def create_magic_link(
    session: SessionDep,
    current_user: Annotated[str, Depends(require_admin)],
) -> MagicLinkRead:
    token = generate_urlsafe()
    expires = dt_utc_offset(1440)
    new_link = MagicLink(token=token, expires=expires, user=current_user)
    session.add(new_link)
    session.commit()
    session.refresh(new_link)
    return MagicLinkRead.serialize(new_link)


@router.delete("/magic-link/{token}")
def delete_magic_link(
    token: str,
    session: SessionDep,
    current_user: Annotated[str, Depends(require_admin)],
):
    db_link = session.exec(
        select(MagicLink).where(
            MagicLink.token == token,
            MagicLink.user == current_user,
        )
    ).first()
    if not db_link:
        raise HTTPException(status_code=404, detail="Not found")
    session.delete(db_link)
    session.commit()
    return {}


@router.delete("/users/{username}")
def delete_user(username: str, session: SessionDep):
    db_user = session.get(User, username)
    if not db_user:
        raise HTTPException(status_code=404, detail="Not found")
    if db_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")

    session.delete(db_user)
    session.commit()
    return {}


@router.post("/users/{username}/reset-password", response_model=TempPasswordRead)
def reset_user_password(username: str, session: SessionDep) -> TempPasswordRead:
    db_user = session.get(User, username)
    if not db_user:
        raise HTTPException(status_code=404, detail="Not found")
    if db_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    temporary = generate_urlsafe()
    db_user.password = hash_password(temporary)
    session.add(db_user)
    session.commit()
    return TempPasswordRead(temporary=temporary)


@router.get("/config", response_model=ConfigRead)
def get_config(session: SessionDep) -> ConfigRead:
    return ConfigRead(**get_settings().model_dump())


@router.put("/config", response_model=ConfigRead)
def update_server_config(config_update: ConfigUpdate, session: SessionDep) -> ConfigRead:
    new_settings = update_config(config_update.model_dump(exclude_none=True))
    return ConfigRead(**new_settings.model_dump())


@router.post("/backups", response_model=BackupRead)
def create_admin_backup(
    background_tasks: BackgroundTasks,
    session: SessionDep,
    current_user: Annotated[str, Depends(require_admin)],
) -> BackupRead:
    db_backup = Backup(user=current_user, full=True)
    session.add(db_backup)
    session.commit()
    session.refresh(db_backup)
    background_tasks.add_task(process_backup_export, db_backup.id, True)
    return BackupRead.serialize(db_backup)


@router.get("/backups", response_model=list[BackupRead])
def read_admin_backups(
    session: SessionDep, current_user: Annotated[str, Depends(require_admin)]
) -> list[BackupRead]:
    db_backups = session.exec(select(Backup).where(Backup.user == current_user, Backup.full.is_(True))).all()
    return [BackupRead.serialize(backup) for backup in db_backups]


@router.get("/backups/{backup_id}/download")
def download_backup(
    backup_id: int, session: SessionDep, current_user: Annotated[str, Depends(require_admin)]
):
    db_backup = session.exec(
        select(Backup).where(
            Backup.id == backup_id, Backup.user == current_user, Backup.status == BackupStatus.COMPLETED
        )
    ).first()
    if not db_backup or not db_backup.filename:
        raise HTTPException(status_code=404, detail="Not found")

    fp = Path(get_settings().BACKUPS_FOLDER) / Path(db_backup.filename).name
    if not fp.exists():
        raise HTTPException(status_code=404, detail="Not found")

    iso_date = db_backup.created_at.strftime("%Y-%m-%d")
    filename = f"TRIP_{iso_date}_full_backup.zip"
    return FileResponse(path=fp, filename=filename, media_type="application/zip")


@router.delete("/backups/{backup_id}")
async def delete_admin_backup(
    backup_id: int, session: SessionDep, current_user: Annotated[str, Depends(require_admin)]
):
    db_backup = session.get(Backup, backup_id)
    if not db_backup:
        raise HTTPException(status_code=404, detail="Not found")
    if not db_backup.user == current_user:
        raise HTTPException(status_code=403, detail="Forbidden")

    session.delete(db_backup)
    session.commit()
    return {}
