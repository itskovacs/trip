import json
from datetime import datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import selectinload
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
    trips_query = (
        select(Trip)
        .where(Trip.user == current_user)
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
        )
    )

    user_settings = UserRead.serialize(session.get(User, current_user))
    categories = session.exec(select(Category).where(Category.user == current_user)).all()
    places = session.exec(select(Place).where(Place.user == current_user)).all()
    trips = session.exec(trips_query).all()
    images = session.exec(select(Image).where(Image.user == current_user)).all()

    data = {
        "_": {"at": datetime.timestamp(datetime.now())},
        "settings": user_settings,
        "categories": [CategoryRead.serialize(c) for c in categories],
        "places": [PlaceRead.serialize(place, exclude_gpx=False) for place in places],
        "trips": [TripRead.serialize(t) for t in trips],
        "images": {},
    }

    for im in images:
        try:
            with open(Path(settings.ASSETS_FOLDER) / im.filename, "rb") as f:
                data["images"][im.id] = b64e(f.read())
        except FileNotFoundError:
            continue

    return data


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
        for category in session.exec(select(Category).filter(Category.user == current_user)).all()
    }

    categories_to_add = []
    for category in data.get("categories", []):
        category_name = category.get("name")
        category_exists = existing_categories.get(category_name)

        if category_exists:
            # Update color if present in import data
            if category.get("color"):
                category_exists.color = category.get("color")

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
                            trip_data["image_id"] = image.id

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
                select(Category).options(selectinload(Category.image)).filter(Category.user == current_user)
            ).all()
        ],
        "settings": UserRead.serialize(session.get(User, current_user)),
    }
