import io
import json
from pathlib import Path
from typing import Annotated
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import Depends, HTTPException, UploadFile
from sqlalchemy.orm import selectinload
from sqlmodel import select

from .. import __version__ as trip_version
from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Backup, BackupStatus, Category, CategoryRead,
                             Image, Place, PlaceRead, Trip, TripAttachment,
                             TripChecklistItem, TripChecklistItemRead, TripDay,
                             TripItem, TripPackingListItem,
                             TripPackingListItemRead, TripRead, User, UserRead)
from .date import dt_utc
from .utils import (assets_folder_path, attachments_trip_folder_path,
                    b64img_decode, save_image_to_file)


def process_backup_export(session: SessionDep, backup_id: int):
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

        user_settings = UserRead.serialize(session.get(User, db_backup.user)).model_dump(mode="json")
        categories = session.exec(select(Category).where(Category.user == db_backup.user)).all()
        places = session.exec(select(Place).where(Place.user == db_backup.user)).all()
        trips = session.exec(trips_query).all()
        images = session.exec(select(Image).where(Image.user == db_backup.user)).all()

        backup_datetime = dt_utc()
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
                "categories": [CategoryRead.serialize(c).model_dump(mode="json") for c in categories],
                "places": [
                    PlaceRead.serialize(p, exclude_gpx=False).model_dump(mode="json") for p in places
                ],
                "trips": [
                    {
                        **TripRead.serialize(t).model_dump(mode="json"),
                        "packing_items": [
                            TripPackingListItemRead.serialize(item).model_dump(mode="json")
                            for item in t.packing_items
                        ],
                        "checklist_items": [
                            TripChecklistItemRead.serialize(item).model_dump(mode="json")
                            for item in t.checklist_items
                        ],
                    }
                    for t in trips
                ],
            }
            zipf.writestr("data.json", json.dumps(data, ensure_ascii=False))

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
        db_backup.completed_at = dt_utc()
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


async def process_backup_import(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)], file: UploadFile
):
    # basic check if zip https://en.wikipedia.org/wiki/ZIP_(file_format)#Local_file_header
    file_header = await file.read(4)
    if not file_header == b"PK\x03\x04":
        raise HTTPException(status_code=415, detail="File must be a ZIP archive")

    await file.seek(0)
    try:
        zip_content = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file")

    try:
        with ZipFile(io.BytesIO(zip_content), "r") as zipf:
            zip_filenames = zipf.namelist()
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
                                    filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
                                    if filename:
                                        image = Image(filename=filename, user=current_user)
                                        session.add(image)
                                        session.flush()
                                        session.refresh(image)

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
                        key: category[key]
                        for key in category.keys()
                        if key not in {"id", "image", "image_id"}
                    }
                    new_category["user"] = current_user

                    if category.get("image_id"):
                        category_filename = category.get("image").split("/")[-1]
                        if category_filename and category_filename in image_files:
                            try:
                                image_bytes = zipf.read(image_files[category_filename])
                                filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
                                if filename:
                                    image = Image(filename=filename, user=current_user)
                                    session.add(image)
                                    session.flush()
                                    session.refresh(image)
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
                                filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
                                if filename:
                                    image = Image(filename=filename, user=current_user)
                                    session.add(image)
                                    session.flush()
                                    session.refresh(image)
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
                                filename = save_image_to_file(image_bytes, settings.TRIP_IMAGE_SIZE)
                                if filename:
                                    image = Image(filename=filename, user=current_user)
                                    session.add(image)
                                    session.flush()
                                    session.refresh(image)
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

                    for day in trip.get("days", []):
                        day_data = {key: day[key] for key in day if key not in {"id", "items"}}
                        new_day = TripDay(**day_data, trip_id=new_trip.id, user=current_user)
                        session.add(new_day)
                        session.flush()
                        session.refresh(new_day)

                        for item in day.get("items", []):
                            item_data = {
                                key: item[key]
                                for key in item
                                if key not in {"id", "place", "place_id", "image", "image_id"}
                            }
                            item_data["day_id"] = new_day.id
                            item_data["user"] = current_user

                            place = item.get("place")
                            if place and (place_id := place.get("id")):
                                new_place_id = trip_place_id_map.get(place_id)
                                item_data["place_id"] = new_place_id

                            if item_data.get("image_id"):
                                place_filename = place.get("image").split("/")[-1]
                                if place_filename and place_filename in image_files:
                                    try:
                                        image_bytes = zipf.read(image_files[place_filename])
                                        filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
                                        if filename:
                                            image = Image(filename=filename, user=current_user)
                                            session.add(image)
                                            session.flush()
                                            session.refresh(image)
                                            item_data["image_id"] = image.id
                                    except Exception:
                                        pass

                            trip_item = TripItem(**item_data)
                            items_to_add.append(trip_item)

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

                    for attachment in trip.get("attachments", []):
                        stored_filename = attachment.get("stored_filename")
                        if not stored_filename:
                            continue

                        if stored_filename and stored_filename in attachment_files:
                            try:
                                attachment_bytes = zipf.read(attachment_files[stored_filename])
                                new_attachment = {
                                    key: attachment[key]
                                    for key in attachment
                                    if key not in {"id", "trip_id", "trip"}
                                }
                                new_attachment["trip_id"] = new_trip.id
                                new_attachment["user"] = current_user
                                new_attachment = TripAttachment(**new_attachment)

                                attachment_path = attachments_trip_folder_path(new_trip.id) / stored_filename
                                attachment_path.write_bytes(attachment_bytes)
                                session.add(new_attachment)
                            except Exception:
                                continue

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
                session.rollback()
                print(exc)
                raise HTTPException(status_code=400, detail="Bad request")

    except Exception as exc:
        print(exc)
        raise HTTPException(status_code=400, detail="Bad request")


async def process_legacy_import(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)], file: UploadFile
):
    # support previous improt format, json file
    # no packing list, no checklist, no attachments
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
