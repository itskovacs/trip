import json
import logging
import sqlite3
import tempfile
from pathlib import Path
from typing import Annotated
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import Depends, HTTPException, UploadFile
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from .. import __version__ as trip_version
from ..config import get_settings
from ..db.core import get_engine
from ..deps import SessionDep, get_current_username
from ..models.models import (Backup, BackupStatus, Category, CategoryRead,
                             Image, Place, PlaceRead, Trip, TripAttachment,
                             TripChecklistItem, TripChecklistItemRead, TripDay,
                             TripItem, TripItemAttachmentLink,
                             TripPackingListItem, TripPackingListItemRead,
                             TripRead, User, UserRead)
from .date import dt_utc, iso_to_dt
from .utils import (assets_folder_path, attachments_folder_path,
                    attachments_trip_folder_path, b64img_decode, remove_image,
                    save_image_to_file)
from .xml import parse_mymaps_kml

logger = logging.getLogger(__name__)


def _stream_path_to_zip(zipf: ZipFile, path: Path, zip_dir: str):
    if not path.exists():
        return

    for fp in path.rglob("*"):
        if not fp.is_file():
            continue
        rel_path = fp.relative_to(path)
        zipf.write(fp, f"{zip_dir}/{rel_path}")


def _admin_backup_export(backup_id: int, zip_fp: Path, session: Session):
    with ZipFile(zip_fp, "w", ZIP_DEFLATED, compresslevel=9) as zipf:
        with tempfile.NamedTemporaryFile() as tmp:
            target = tmp.name
            with sqlite3.connect(get_settings().SQLITE_FILE) as src, sqlite3.connect(target) as dst:
                src.backup(dst)
            zipf.write(target, "trip.sqlite")

        _stream_path_to_zip(zipf, assets_folder_path(), "assets")
        _stream_path_to_zip(zipf, attachments_folder_path(), "attachments")


def _user_backup_export(backup_id: int, user: str, backup_dt, zip_fp: Path, session: Session):
    with ZipFile(zip_fp, "w", ZIP_DEFLATED) as zipf:
        user_settings = UserRead.serialize(session.get(User, user)).model_dump(mode="json")
        categories = session.exec(select(Category).where(Category.user == user)).all()
        places = session.exec(select(Place).where(Place.user == user)).all()

        data = {
            "_": {
                "version": trip_version,
                "at": backup_dt.isoformat(),
                "user": user,
            },
            "settings": user_settings,
            "categories": [CategoryRead.serialize(c).model_dump(mode="json") for c in categories],
            "places": [PlaceRead.serialize(p, exclude_gpx=False).model_dump(mode="json") for p in places],
        }

        trips_query = (
            select(Trip)
            .where(Trip.user == user)
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
            .execution_options(yield_per=10)
        )

        with zipf.open("data.json", "w") as df:
            df.write(json.dumps(data, ensure_ascii=False)[:-1].encode())  # [:-1] to strip '}'
            df.write(b', "trips": [')

            first = True
            for t in session.exec(trips_query):
                dct = {
                    **TripRead.serialize(t).model_dump(mode="json"),
                    "packing_items": [
                        TripPackingListItemRead.serialize(i).model_dump(mode="json") for i in t.packing_items
                    ],
                    "checklist_items": [
                        TripChecklistItemRead.serialize(i).model_dump(mode="json") for i in t.checklist_items
                    ],
                }

                prefix = b"" if first else b", "
                df.write(prefix + json.dumps(dct, ensure_ascii=False).encode())
                first = False

            df.write(b"]}")

        for image in session.exec(select(Image).where(Image.user == user)):
            img_path = assets_folder_path() / image.filename
            if img_path.is_file():
                zipf.write(img_path, f"images/{image.filename}")

        attachment_query = select(TripAttachment).where(TripAttachment.uploaded_by == user)
        for att in session.exec(attachment_query):
            att_path = attachments_trip_folder_path(att.trip_id) / att.stored_filename
            if att_path.is_file():
                zipf.write(att_path, f"attachments/{att.trip_id}/{att.stored_filename}")


def process_backup_export(backup_id: int, full: bool = False):
    engine = get_engine()
    with Session(engine) as session:
        db_backup = session.get(Backup, backup_id)
        if not db_backup:
            return

        db_backup.status = BackupStatus.PROCESSING
        session.commit()

        backup_dt = dt_utc()
        iso_date = backup_dt.strftime("%Y-%m-%dT%H-%M-%S")
        if full:
            filename = f"TRIP_{iso_date}_full_backup.zip"
        else:
            filename = f"TRIP_{db_backup.user}_{iso_date}_backup.zip"
        backups_dir = Path(get_settings().BACKUPS_FOLDER)
        backups_dir.mkdir(parents=True, exist_ok=True)
        zip_fp = backups_dir / filename

        try:
            if full:
                _admin_backup_export(backup_id, zip_fp, session)
            else:
                _user_backup_export(backup_id, db_backup.user, backup_dt, zip_fp, session)

            db_backup.file_size = zip_fp.stat().st_size
            db_backup.status = BackupStatus.COMPLETED
            db_backup.completed_at = dt_utc()
            db_backup.filename = filename
            session.commit()
        except Exception as exc:
            logger.error(
                f"[BACKUP EXPORT]: Backup export (backup_id={backup_id}, full={full}) failed: {exc}"
            )
            db_backup.status = BackupStatus.FAILED
            db_backup.error_message = str(exc)[:200]
            session.commit()

            try:
                if zip_fp.exists():
                    zip_fp.unlink()
            except Exception as exc:
                logger.error(f"[BACKUP EXPORT]: Failed to clean ({zip_fp}): {exc}")


# use def instead of async def https://fastapi.tiangolo.com/async/#path-operation-functions
def process_backup_import(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)], file: UploadFile
):
    # basic check if zip https://en.wikipedia.org/wiki/ZIP_(file_format)#Local_file_header
    file_header = file.file.read(4)
    if not file_header == b"PK\x03\x04":
        raise HTTPException(status_code=415, detail="File must be a ZIP archive")

    file.file.seek(0)
    with ZipFile(file.file, "r") as zipf:
        zip_filenames = []
        for name in zipf.namelist():
            if ".." in name or name.startswith("/"):
                raise HTTPException(status_code=400, detail="Bad Request :)")
            zip_filenames.append(name)

        if "data.json" not in zip_filenames:
            raise HTTPException(status_code=400, detail="Invalid file")

        try:
            data = json.loads(zipf.read("data.json"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid file")

        image_files = {
            path.split("/")[-1]: path
            for path in zip_filenames
            if path.startswith("images/") and not path.endswith("/")
        }

        attachment_files = {
            path.split("/")[-1]: path
            for path in zip_filenames
            if path.startswith("attachments/") and not path.endswith("/")
        }

        error_details = "Bad request"
        created_image_filenames = []
        created_attachment_trips = []
        try:
            existing_categories = {
                category.name: category
                for category in session.exec(select(Category).where(Category.user == current_user)).all()
            }

            categories_to_add = []
            for category in data.get("categories", []):
                category_name = category.get("name")
                category_exists = existing_categories.get(category_name)

                if category_exists:
                    if category.get("color"):
                        category_exists.color = category["color"]

                    if category.get("image_id") and category.get("image_id") != category_exists.image_id:
                        category_filename = category.get("image").split("/")[-1]
                        if category_filename and category_filename in image_files:
                            try:
                                image_bytes = zipf.read(image_files[category_filename])
                                filename, file_size = save_image_to_file(
                                    image_bytes, get_settings().PLACE_IMAGE_SIZE
                                )
                                if filename:
                                    image = Image(filename=filename, file_size=file_size, user=current_user)
                                    session.add(image)
                                    session.flush()
                                    session.refresh(image)
                                    created_image_filenames.append(filename)

                                    if category_exists.image_id:
                                        old_image = session.get(Image, category_exists.image_id)
                                        if old_image:
                                            session.delete(old_image)
                                            category_exists.image_id = None
                                            session.flush()

                                    category_exists.image_id = image.id
                            except Exception:
                                pass

                    session.add(category_exists)
                    existing_categories[category_name] = category_exists
                    continue

                new_category = {
                    key: category[key] for key in category.keys() if key not in {"id", "image", "image_id"}
                }
                new_category["user"] = current_user

                if category.get("image_id"):
                    category_filename = category.get("image").split("/")[-1]
                    if category_filename and category_filename in image_files:
                        try:
                            image_bytes = zipf.read(image_files[category_filename])
                            filename, file_size = save_image_to_file(
                                image_bytes, get_settings().PLACE_IMAGE_SIZE
                            )
                            if filename:
                                image = Image(filename=filename, file_size=file_size, user=current_user)
                                session.add(image)
                                session.flush()
                                session.refresh(image)
                                created_image_filenames.append(filename)
                                new_category["image_id"] = image.id
                        except Exception:
                            pass

                new_category = Category(**new_category)
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

                new_place = {
                    key: place[key]
                    for key in place.keys()
                    if key not in {"id", "image", "image_id", "category", "category_id"}
                }
                new_place["user"] = current_user
                new_place["category_id"] = category.id

                if place.get("image_id"):
                    place_filename = place.get("image").split("/")[-1]
                    if place_filename and place_filename in image_files:
                        try:
                            image_bytes = zipf.read(image_files[place_filename])
                            filename, file_size = save_image_to_file(
                                image_bytes, get_settings().PLACE_IMAGE_SIZE
                            )
                            if filename:
                                image = Image(filename=filename, file_size=file_size, user=current_user)
                                session.add(image)
                                session.flush()
                                session.refresh(image)
                                created_image_filenames.append(filename)
                                new_place["image_id"] = image.id
                        except Exception:
                            pass

                new_place = Place(**new_place)
                places_to_add.append(new_place)
                places.append(new_place)

            if places_to_add:
                session.add_all(places_to_add)
                session.flush()

            db_user = session.get(User, current_user)
            if data.get("settings") and db_user:
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
            items_to_add = []
            packing_to_add = []
            checklist_to_add = []
            attachment_links_to_add = []
            for trip in data.get("trips", []):
                new_trip = {
                    key: trip[key]
                    for key in trip.keys()
                    if key
                    not in {
                        "id",
                        "image",
                        "image_id",
                        "places",
                        "days",
                        "shared",
                        "collaborators",
                        "attachments",
                        "packing_items",
                        "checklist_items",
                    }
                }
                new_trip["user"] = current_user

                if trip.get("image_id"):
                    trip_filename = trip.get("image").split("/")[-1]
                    if trip_filename and trip_filename in image_files:
                        try:
                            image_bytes = zipf.read(image_files[trip_filename])
                            filename, file_size = save_image_to_file(
                                image_bytes, get_settings().TRIP_IMAGE_SIZE
                            )
                            if filename:
                                image = Image(filename=filename, file_size=file_size, user=current_user)
                                session.add(image)
                                session.flush()
                                session.refresh(image)
                                created_image_filenames.append(filename)
                                new_trip["image_id"] = image.id
                        except Exception:
                            pass

                new_trip = Trip(**new_trip)
                session.add(new_trip)
                session.flush()
                session.refresh(new_trip)

                for place in trip.get("places", []):
                    old_id = place.get("id")
                    new_place_id = trip_place_id_map.get(old_id)
                    if new_place_id:
                        db_place = session.get(Place, new_place_id)
                        if db_place:
                            new_trip.places.append(db_place)

                trip_attachment_mapping = {}
                for attachment in trip.get("attachments", []):
                    stored_filename = attachment.get("stored_filename")
                    old_attachment_id = attachment.get("id")

                    if not stored_filename or not old_attachment_id:
                        continue

                    if stored_filename in attachment_files:
                        try:
                            attachment_bytes = zipf.read(attachment_files[stored_filename])
                            new_attachment = {
                                key: attachment[key]
                                for key in attachment
                                if key not in {"id", "trip_id", "trip", "uploaded_by"}
                            }
                            new_attachment["trip_id"] = new_trip.id
                            new_attachment["uploaded_by"] = current_user
                            new_attachment_obj = TripAttachment(**new_attachment)

                            attachment_path = attachments_trip_folder_path(new_trip.id) / stored_filename
                            created_attachment_trips.append(new_trip.id)
                            attachment_path.write_bytes(attachment_bytes)
                            session.add(new_attachment_obj)
                            session.flush()
                            session.refresh(new_attachment_obj)
                            trip_attachment_mapping[old_attachment_id] = new_attachment_obj.id

                        except Exception:
                            continue

                for day in trip.get("days", []):
                    day_data = {key: day[key] for key in day if key not in {"id", "items"}}
                    if "dt" in day_data and isinstance(day_data["dt"], str):
                        day_data["dt"] = iso_to_dt(day_data["dt"])
                    new_day = TripDay(**day_data, trip_id=new_trip.id)
                    session.add(new_day)
                    session.flush()

                    for item in day.get("items", []):
                        if item.get("paid_by"):
                            u = item.get("paid_by")
                            db_user = session.get(User, u)
                            if not db_user:
                                error_details = f"User <{u}> does not exist and is specified in Paid By"
                                raise

                        item_data = {
                            key: item[key]
                            for key in item
                            if key not in {"id", "place", "place_id", "image", "image_id", "attachments"}
                        }
                        item_data["day_id"] = new_day.id

                        place = item.get("place")
                        if place and (place_id := place.get("id")):
                            new_place_id = trip_place_id_map.get(place_id)
                            item_data["place_id"] = new_place_id

                        if item_data.get("image_id"):
                            place_filename = place.get("image").split("/")[-1]
                            if place_filename and place_filename in image_files:
                                try:
                                    image_bytes = zipf.read(image_files[place_filename])
                                    filename, file_size = save_image_to_file(
                                        image_bytes, get_settings().PLACE_IMAGE_SIZE
                                    )
                                    if filename:
                                        image = Image(
                                            filename=filename, file_size=file_size, user=current_user
                                        )
                                        session.add(image)
                                        session.flush()
                                        session.refresh(image)
                                        created_image_filenames.append(filename)
                                        item_data["image_id"] = image.id
                                except Exception:
                                    pass

                        trip_item = TripItem(**item_data)
                        session.add(trip_item)
                        session.flush()
                        session.refresh(trip_item)
                        items_to_add.append(trip_item)

                        for attachment in item.get("attachments", []):
                            attachment_id = attachment.get("id")
                            if attachment_id and attachment_id in trip_attachment_mapping:
                                new_attachment_id = trip_attachment_mapping[attachment_id]
                                link = TripItemAttachmentLink(
                                    item_id=trip_item.id, attachment_id=new_attachment_id
                                )
                                attachment_links_to_add.append(link)

                for item in trip.get("packing_items", []):
                    new_packing = {
                        key: item[key] for key in item.keys() if key not in {"id", "trip_id", "trip"}
                    }
                    new_packing["trip_id"] = new_trip.id
                    packing_to_add.append(TripPackingListItem(**new_packing))

                for item in trip.get("checklist_items", []):
                    new_checklist = {
                        key: item[key] for key in item.keys() if key not in {"id", "trip_id", "trip"}
                    }
                    new_checklist["trip_id"] = new_trip.id
                    checklist_to_add.append(TripChecklistItem(**new_checklist))

            if attachment_links_to_add:
                session.add_all(attachment_links_to_add)

            if items_to_add:
                session.add_all(items_to_add)

            if packing_to_add:
                session.add_all(packing_to_add)

            if checklist_to_add:
                session.add_all(checklist_to_add)

            # BOOM!
            session.commit()

            return {
                "places": [PlaceRead.serialize(p) for p in places],
                "categories": [
                    CategoryRead.serialize(c)
                    for c in session.exec(
                        select(Category)
                        .options(selectinload(Category.image))
                        .where(Category.user == current_user)
                    ).all()
                ],
                "settings": UserRead.serialize(session.get(User, current_user)),
            }

        except Exception as exc:
            logger.error(f"[BACKUP IMPORT]: {exc}")
            session.rollback()
            for filename in created_image_filenames:
                remove_image(filename)
            for trip_id in created_attachment_trips:
                try:
                    folder = attachments_trip_folder_path(trip_id)
                    if not folder.exists():
                        continue
                    for file in folder.iterdir():
                        file.unlink()
                    folder.rmdir()
                except Exception:
                    pass
            raise HTTPException(status_code=400, detail=error_details)


def process_legacy_import(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)], file: UploadFile
):
    # support previous improt format, json file
    # no packing list, no checklist, no attachments
    try:
        content = file.file.read()
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
                    filename, file_size = save_image_to_file(image_bytes, get_settings().PLACE_IMAGE_SIZE)
                    if not filename:
                        raise HTTPException(status_code=500, detail="Error saving image")

                    image = Image(filename=filename, file_size=file_size, user=current_user)
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
            filename, file_size = save_image_to_file(image_bytes, get_settings().PLACE_IMAGE_SIZE)
            if filename:
                image = Image(filename=filename, file_size=file_size, user=current_user)
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
                filename, file_size = save_image_to_file(image_bytes, get_settings().PLACE_IMAGE_SIZE)
                if filename:
                    image = Image(filename=filename, file_size=file_size, user=current_user)
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
                filename, file_size = save_image_to_file(image_bytes, get_settings().TRIP_IMAGE_SIZE)
                if filename:
                    image = Image(filename=filename, file_size=file_size, user=current_user)
                    session.add(image)
                    session.flush()
                    session.refresh(image)
                    trip_data["image_id"] = image.id

        new_trip = Trip(**trip_data)
        session.add(new_trip)
        session.flush()

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
                        filename, file_size = save_image_to_file(image_bytes, get_settings().TRIP_IMAGE_SIZE)
                        if filename:
                            image = Image(filename=filename, file_size=file_size, user=current_user)
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


def parse_mymaps_kmz(file: UploadFile) -> list[dict]:
    file_header = file.file.read(4)
    if not file_header == b"PK\x03\x04":
        raise HTTPException(status_code=415, detail="Invalid KMZ file")

    file.file.seek(0)
    places = []
    try:
        with ZipFile(file.file, "r") as kmz:
            kml_files = [name for name in kmz.namelist() if name.endswith(".kml")]
            if not kml_files:
                raise ValueError("Invalid KMZ file: missing KML file")
            for kml_filename in kml_files:
                with kmz.open(kml_filename, "r") as kml_file:
                    kml_content = kml_file.read().decode("utf-8")
                    places.extend(parse_mymaps_kml(kml_content))
    except Exception as exc:
        logger.error(f"[KMZ IMPORT]: {exc}")
        raise HTTPException(status_code=400, detail="Failed to parse KMZ file")
    return places
