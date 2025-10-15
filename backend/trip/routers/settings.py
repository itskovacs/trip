import json
from pathlib import Path
from typing import Annotated
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import (APIRouter, BackgroundTasks, Depends, File, HTTPException,
                     UploadFile)
from fastapi.responses import FileResponse
from sqlalchemy.orm import selectinload
from sqlmodel import select

from .. import __version__ as trip_version
from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Backup, BackupRead, BackupStatus, Category,
                             CategoryRead, Image, Place, PlaceRead, Trip,
                             TripDay, TripItem, TripRead, User, UserRead,
                             UserUpdate)
from ..utils.utils import (assets_folder_path, attachments_trip_folder_path,
                           b64img_decode, check_update, save_image_to_file,
                           utc_now)

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
    background_tasks.add_task(_process_backup_task, session, db_backup.id)
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


def _process_backup_task(session: SessionDep, backup_id: int):
    db_backup = session.get(Backup, backup_id)
    if not db_backup:
        return

    try:
        db_backup.status = BackupStatus.PROCESSING
        session.commit()

        trips_query = (
            select(Trip)
            .where(Trip.user == db_backup.user)
            .options(
                selectinload(Trip.days)
                .selectinload(TripDay.items)
                .options(
                    selectinload(TripItem.place).selectinload(Place.category).selectinload(Category.image),
                    selectinload(TripItem.place).selectinload(Place.image),
                    selectinload(TripItem.image),
                ),
                selectinload(Trip.places).options(
                    selectinload(Place.category).selectinload(Category.image),
                    selectinload(Place.image),
                ),
                selectinload(Trip.image),
                selectinload(Trip.memberships),
                selectinload(Trip.shares),
                selectinload(Trip.packing_items),
                selectinload(Trip.checklist_items),
                selectinload(Trip.attachments),
            )
        )

        user_settings = UserRead.serialize(session.get(User, db_backup.user))
        categories = session.exec(select(Category).where(Category.user == db_backup.user)).all()
        places = session.exec(select(Place).where(Place.user == db_backup.user)).all()
        trips = session.exec(trips_query).all()
        images = session.exec(select(Image).where(Image.user == db_backup.user)).all()

        backup_datetime = utc_now()
        iso_date = backup_datetime.strftime("%Y-%m-%d")
        filename = f"TRIP_{iso_date}_{db_backup.user}_backup.zip"
        zip_fp = Path(settings.BACKUPS_FOLDER) / filename
        Path(settings.BACKUPS_FOLDER).mkdir(parents=True, exist_ok=True)

        with ZipFile(zip_fp, "w", ZIP_DEFLATED) as zipf:
            data = {
                "_": {
                    "version": trip_version,
                    "at": backup_datetime.isoformat(),
                    "user": db_backup.user,
                },
                "settings": user_settings,
                "categories": [CategoryRead.serialize(c) for c in categories],
                "places": [PlaceRead.serialize(place, exclude_gpx=False) for place in places],
                "trips": [TripRead.serialize(t) for t in trips],
            }
            zipf.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2, default=str))

            for db_image in images:
                try:
                    filepath = assets_folder_path() / db_image.filename
                    if filepath.exists() and filepath.is_file():
                        zipf.write(filepath, f"images/{db_image.filename}")
                except Exception:
                    continue

            for trip in trips:
                if not trip.attachments:
                    continue

                for attachment in trip.attachments:
                    try:
                        filepath = attachments_trip_folder_path(trip.id) / attachment.stored_filename
                        if filepath.exists() and filepath.is_file():
                            zipf.write(filepath, f"attachments/{trip.id}/{attachment.stored_filename}")
                    except Exception:
                        continue

        db_backup.file_size = zip_fp.stat().st_size
        db_backup.status = BackupStatus.COMPLETED
        db_backup.completed_at = utc_now()
        db_backup.filename = filename
        session.commit()
    except Exception as exc:
        db_backup.status = BackupStatus.FAILED
        db_backup.error_message = str(exc)[:200]
        session.commit()

        try:
            if filepath.exists():
                filepath.unlink()
        except Exception:
            pass


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


@router.post("/import")
async def import_data(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
):
    if file.content_type != "application/json":
        raise HTTPException(status_code=415, detail="File must be a JSON file")

    try:
        content = await file.read()
        data = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file")

    existing_categories = {
        category.name: category
        for category in session.exec(select(Category).where(Category.user == current_user)).all()
    }

    categories_to_add = []
    for category in data.get("categories", []):
        category_name = category.get("name")
        category_exists = existing_categories.get(category_name)

        if category_exists:
            # Update color if present in import data
            if category.get("color"):
                category_exists.color = category.get("color")

            # Handle image update
            if category.get("image_id"):
                b64_image = data.get("images", {}).get(str(category.get("image_id")))
                if b64_image:
                    image_bytes = b64img_decode(b64_image)
                    filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
                    if not filename:
                        raise HTTPException(status_code=500, detail="Error saving image")

                    image = Image(filename=filename, user=current_user)
                    session.add(image)
                    session.flush()
                    session.refresh(image)

                    if category_exists.image_id:
                        old_image = session.get(Image, category_exists.image_id)
                        try:
                            session.delete(old_image)
                            category_exists.image_id = None
                            session.flush()
                        except Exception:
                            raise HTTPException(
                                status_code=500, detail="Failed to remove old image during import"
                            )

                    category_exists.image_id = image.id

            session.add(category_exists)
            existing_categories[category_name] = category_exists
            continue

        category_data = {
            key: category[key] for key in category.keys() if key not in {"id", "image", "image_id"}
        }
        category_data["user"] = current_user

        if category.get("image_id"):
            b64_image = data.get("images", {}).get(str(category.get("image_id")))
            if b64_image is None:
                continue

            image_bytes = b64img_decode(b64_image)
            filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
            if filename:
                image = Image(filename=filename, user=current_user)
                session.add(image)
                session.flush()
                session.refresh(image)
                category_data["image_id"] = image.id

        new_category = Category(**category_data)
        categories_to_add.append(new_category)
        session.add(new_category)

    if categories_to_add:
        session.flush()
        for category in categories_to_add:
            existing_categories[category.name] = category

    places = []
    places_to_add = []
    for place in data.get("places", []):
        category_name = place.get("category", {}).get("name")
        category = existing_categories.get(category_name)
        if not category:
            continue

        place_data = {
            key: place[key]
            for key in place.keys()
            if key not in {"id", "image", "image_id", "category", "category_id"}
        }
        place_data["user"] = current_user
        place_data["category_id"] = category.id

        if place.get("image_id"):
            b64_image = data.get("images", {}).get(str(place.get("image_id")))
            if b64_image:
                image_bytes = b64img_decode(b64_image)
                filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
                if filename:
                    image = Image(filename=filename, user=current_user)
                    session.add(image)
                    session.flush()
                    session.refresh(image)
                    place_data["image_id"] = image.id

        new_place = Place(**place_data)
        places_to_add.append(new_place)
        places.append(new_place)

    if places_to_add:
        session.add_all(places_to_add)
        session.flush()

    db_user = session.get(User, current_user)
    if data.get("settings"):
        settings_data = data["settings"]
        setting_fields = [
            "map_lat",
            "map_lng",
            "currency",
            "tile_layer",
            "mode_low_network",
            "mode_dark",
            "mode_gpx_in_place",
        ]

        for field in setting_fields:
            if field in settings_data:
                setattr(db_user, field, settings_data[field])

        if "do_not_display" in settings_data:
            db_user.do_not_display = ",".join(settings_data["do_not_display"])

        session.add(db_user)
        session.flush()

    trip_place_id_map = {p["id"]: new_p.id for p, new_p in zip(data.get("places", []), places)}
    trips_to_add = []
    days_to_add = []
    items_to_add = []
    for trip in data.get("trips", []):
        trip_data = {
            key: trip[key]
            for key in trip.keys()
            if key not in {"id", "image", "image_id", "places", "days", "shared"}
        }
        trip_data["user"] = current_user

        if trip.get("image_id"):
            b64_image = data.get("images", {}).get(str(trip.get("image_id")))
            if b64_image:
                image_bytes = b64img_decode(b64_image)
                filename = save_image_to_file(image_bytes, settings.TRIP_IMAGE_SIZE)
                if filename:
                    image = Image(filename=filename, user=current_user)
                    session.add(image)
                    session.flush()
                    session.refresh(image)
                    trip_data["image_id"] = image.id

        new_trip = Trip(**trip_data)
        session.add(new_trip)
        session.flush()
        trips_to_add.append(new_trip)

        for place in trip.get("places", []):
            old_id = place["id"]
            new_place_id = trip_place_id_map.get(old_id)
            if new_place_id:
                db_place = session.get(Place, new_place_id)
                if db_place:
                    new_trip.places.append(db_place)

        for day in trip.get("days", []):
            day_data = {key: day[key] for key in day if key not in {"id", "items"}}
            new_day = TripDay(**day_data, trip_id=new_trip.id, user=current_user)
            session.add(new_day)
            session.flush()
            days_to_add.append(new_day)

            for item in day.get("items", []):
                item_data = {
                    key: item[key]
                    for key in item
                    if key not in {"id", "place", "place_id", "image", "image_id"}
                }
                item_data["day_id"] = new_day.id
                item_data["user"] = current_user

                place = item.get("place")
                if (
                    place
                    and (place_id := place.get("id"))
                    and (new_place_id := trip_place_id_map.get(place_id))
                ):
                    item_data["place_id"] = new_place_id

                if item.get("image_id"):
                    b64_image = data.get("images", {}).get(str(item.get("image_id")))
                    if b64_image:
                        image_bytes = b64img_decode(b64_image)
                        filename = save_image_to_file(image_bytes, settings.TRIP_IMAGE_SIZE)
                        if filename:
                            image = Image(filename=filename, user=current_user)
                            session.add(image)
                            session.flush()
                            session.refresh(image)
                            item_data["image_id"] = image.id

                trip_item = TripItem(**item_data)
                items_to_add.append(trip_item)

    if items_to_add:
        session.add_all(items_to_add)

    session.commit()

    return {
        "places": [PlaceRead.serialize(p) for p in places],
        "categories": [
            CategoryRead.serialize(c)
            for c in session.exec(
                select(Category).options(selectinload(Category.image)).where(Category.user == current_user)
            ).all()
        ],
        "settings": UserRead.serialize(session.get(User, current_user)),
    }
