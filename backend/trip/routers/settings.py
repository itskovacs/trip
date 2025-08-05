import json
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Category, CategoryRead, Image, Place, PlaceRead,
                             Trip, TripDay, TripItem, TripRead, User, UserRead,
                             UserUpdate)
from ..utils.utils import (b64e, b64img_decode, check_update, remove_image,
                           save_image_to_file)

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


@router.get("/export")
def export_data(session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]):
    data = {
        "_": {
            "at": datetime.timestamp(datetime.now()),
        },
        "categories": [
            CategoryRead.serialize(c)
            for c in session.exec(select(Category).filter(Category.user == current_user))
        ],
        "places": [
            PlaceRead.serialize(place)
            for place in session.exec(select(Place).filter(Place.user == current_user))
        ],
        "images": {},
        "trips": [
            TripRead.serialize(c) for c in session.exec(select(Trip).filter(Trip.user == current_user))
        ],
        "settings": UserRead.serialize(session.get(User, current_user)),
    }

    images = session.exec(select(Image).where(Image.user == current_user))
    for im in images:
        with open(Path(settings.ASSETS_FOLDER) / im.filename, "rb") as f:
            data["images"][im.id] = b64e(f.read())

    return data


@router.post("/import", response_model=list[PlaceRead])
async def import_data(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
) -> list[PlaceRead]:
    if file.content_type != "application/json":
        raise HTTPException(status_code=415, detail="File must be a JSON file")

    try:
        content = await file.read()
        data = json.loads(content)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file")

    for category in data.get("categories", []):
        category_name = category.get("name")
        category_exists = session.exec(
            select(Category).filter(Category.user == current_user, Category.name == category_name)
        ).first()
        if category_exists:
            # Update color if present in import data
            if category.get("color"):
                category_exists.color = category.get("color")

            # Handle image update
            if category.get("image_id"):
                b64_image = category.get("images", {}).get(str(category.get("image_id")))
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
                            remove_image(old_image.filename)
                            session.delete(old_image)
                            category_exists.image_id = None
                            session.flush()
                        except Exception:
                            raise HTTPException(
                                status_code=500, detail="Failed to remove old image during import"
                            )

                    category_exists.image_id = image.id

            session.add(category_exists)
            session.flush()
            session.refresh(category_exists)
            continue

        category_data = {
            key: category[key] for key in category.keys() if key not in {"id", "image", "image_id"}
        }
        category_data["user"] = current_user

        if category.get("image_id"):
            b64_image = category.get("images", {}).get(str(category.get("image_id")))
            if b64_image is None:
                continue

            image_bytes = b64img_decode(b64_image)
            filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
            if not filename:
                raise HTTPException(status_code=500, detail="Error saving image")

            image = Image(filename=filename, user=current_user)
            session.add(image)
            session.flush()
            session.refresh(image)
            category_data["image_id"] = image.id

        new_category = Category(**category_data)
        session.add(new_category)
        session.flush()
        session.refresh(new_category)

    places = []
    for place in data.get("places", []):
        category_name = place.get("category", {}).get("name")
        category = session.exec(
            select(Category).filter(Category.user == current_user, Category.name == category_name)
        ).first()
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
            if b64_image is None:
                continue

            image_bytes = b64img_decode(b64_image)
            filename = save_image_to_file(image_bytes, settings.PLACE_IMAGE_SIZE)
            if not filename:
                raise HTTPException(status_code=500, detail="Error saving image")

            image = Image(filename=filename, user=current_user)
            session.add(image)
            session.flush()
            session.refresh(image)
            place_data["image_id"] = image.id

        new_place = Place(**place_data)
        session.add(new_place)
        session.flush()
        places.append(new_place)

    db_user = session.get(User, current_user)
    if data.get("settings"):
        settings_data = data["settings"]
        if settings_data.get("map_lat"):
            db_user.map_lat = settings_data["map_lat"]

        if settings_data.get("map_lng"):
            db_user.map_lng = settings_data["map_lng"]

        if settings_data.get("currency"):
            db_user.currency = settings_data["currency"]

        session.add(db_user)
        session.refresh(db_user)

    trip_place_id_map = {p["id"]: new_p.id for p, new_p in zip(data.get("places", []), places)}
    for trip in data.get("trips", []):
        trip_data = {
            key: trip[key] for key in trip.keys() if key not in {"id", "image", "image_id", "places", "days"}
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
        session.refresh(new_trip)

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
            session.refresh(new_day)

            for item in day.get("items", []):
                item_data = {key: item[key] for key in item if key not in {"id", "place"}}
                place = item.get("place")
                if (
                    place
                    and (place_id := place.get("id"))
                    and (new_place_id := trip_place_id_map.get(place_id))
                ):
                    item_data["place_id"] = new_place_id

                item_data["day_id"] = new_day.id
                trip_item = TripItem(**item_data)
                session.add(trip_item)
    session.commit()

    return [PlaceRead.serialize(p) for p in places]
