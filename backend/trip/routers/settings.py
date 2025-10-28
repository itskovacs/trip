from pathlib import Path
from typing import Annotated

from fastapi import (APIRouter, BackgroundTasks, Body, Depends, File,
                     HTTPException, UploadFile)
from fastapi.responses import FileResponse
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Backup, BackupRead, BackupStatus, User, UserRead,
                             UserUpdate)
from ..security import generate_totp_secret, verify_totp_code
from ..utils.utils import check_update
from ..utils.zip import (process_backup_export, process_backup_import,
                         process_legacy_import)

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=UserRead)
def get_user_settings(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> UserRead:
    db_user = session.get(User, current_user)
    return UserRead.serialize(db_user)


@router.put("", response_model=UserRead)
def put_user_settings(
    session: SessionDep, data: UserUpdate, current_user: Annotated[str, Depends(get_current_username)]
) -> UserRead:
    db_user = session.get(User, current_user)

    user_data = data.model_dump(exclude_unset=True)
    if "do_not_display" in user_data:
        user_data["do_not_display"] = (
            ",".join(user_data["do_not_display"]) if user_data["do_not_display"] else ""
        )

    for key, value in user_data.items():
        setattr(db_user, key, value)

    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return UserRead.serialize(db_user)


@router.post("/totp")
async def enable_totp(session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]):
    db_user = session.get(User, current_user)
    if not db_user:
        raise HTTPException(status_code=404, detail="The resource does not exist")

    if db_user.totp_enabled:
        raise HTTPException(status_code=400, detail="Bad request")

    totp_secret = generate_totp_secret()
    db_user.totp_secret = totp_secret
    session.add(db_user)
    session.commit()

    return {"secret": totp_secret}


@router.post("/totp/verify")
async def verify_totp(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    code: str = Body(..., embed=True),
):
    db_user = session.get(User, current_user)
    if not db_user:
        raise HTTPException(status_code=404, detail="The resource does not exist")

    if not db_user.totp_secret or db_user.totp_enabled:
        raise HTTPException(status_code=400, detail="Bad request")

    success = verify_totp_code(db_user.totp_secret, code)
    if not success:
        db_user.totp_secret = None
        session.add(db_user)
        session.commit()
        raise HTTPException(status_code=403, detail="Invalid code")

    db_user.totp_enabled = True
    session.add(db_user)
    session.commit()

    return {}


@router.delete("/totp/{code}")
async def delete_totp(
    session: SessionDep, code: str, current_user: Annotated[str, Depends(get_current_username)]
):
    db_user = session.get(User, current_user)
    if not db_user or not db_user.totp_enabled or not db_user.totp_secret:
        raise HTTPException(status_code=400, detail="Bad request")

    success = verify_totp_code(db_user.totp_secret, code)
    if not success:
        raise HTTPException(status_code=403, detail="Invalid code")

    db_user.totp_secret = None
    db_user.totp_enabled = False

    session.add(db_user)
    session.commit()

    return {}


@router.get("/checkversion")
async def check_version(session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]):
    return await check_update()


@router.post("/backups", response_model=BackupRead)
def create_backup_export(
    background_tasks: BackgroundTasks,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> BackupRead:
    db_backup = Backup(user=current_user)
    session.add(db_backup)
    session.commit()
    session.refresh(db_backup)
    background_tasks.add_task(process_backup_export, session, db_backup.id)
    return BackupRead.serialize(db_backup)


@router.get("/backups", response_model=list[BackupRead])
def read_backups(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[BackupRead]:
    db_backups = session.exec(select(Backup).where(Backup.user == current_user)).all()
    return [BackupRead.serialize(backup) for backup in db_backups]


@router.get("/backups/{backup_id}/download")
def download_backup(
    backup_id: int, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
):
    db_backup = session.exec(
        select(Backup).where(
            Backup.id == backup_id, Backup.user == current_user, Backup.status == BackupStatus.COMPLETED
        )
    ).first()
    if not db_backup or not db_backup.filename:
        raise HTTPException(status_code=404, detail="Not found")

    file_path = Path(settings.BACKUPS_FOLDER) / db_backup.filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Not found")

    iso_date = db_backup.created_at.strftime("%Y-%m-%d")
    filename = f"TRIP_{iso_date}_{current_user}_backup.zip"
    return FileResponse(path=file_path, filename=filename, media_type="application/zip")


@router.delete("/backups/{backup_id}")
async def delete_backup(
    backup_id: int, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
):
    db_backup = session.get(Backup, backup_id)
    if not db_backup.user == current_user:
        raise HTTPException(status_code=403, detail="Forbidden")

    session.delete(db_backup)
    session.commit()
    return {}


@router.post("/backups/import")
async def backup_import(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
):
    content_type = file.content_type
    if content_type == "application/json":
        return await process_legacy_import(session, current_user, file)

    elif content_type == "application/x-zip-compressed" or content_type == "application/zip":
        return await process_backup_import(session, current_user, file)

    raise HTTPException(status_code=400, detail="Bad request, invalid file")
