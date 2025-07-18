from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Image, Place, Trip, TripCreate, TripDay,
                             TripDayBase, TripDayRead, TripItem,
                             TripItemCreate, TripItemRead, TripItemUpdate,
                             TripPlaceLink, TripRead, TripReadBase, TripUpdate)
from ..security import verify_exists_and_owns
from ..utils.utils import b64img_decode, remove_image, save_image_to_file

router = APIRouter(prefix="/api/trips", tags=["trips"])


@router.get("", response_model=list[TripReadBase])
def read_trips(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[TripReadBase]:
    trips = session.exec(select(Trip).filter(Trip.user == current_user))
    return [TripReadBase.serialize(trip) for trip in trips]


@router.get("/{trip_id}", response_model=TripRead)
def read_trip(
    session: SessionDep, trip_id: int, current_user: Annotated[str, Depends(get_current_username)]
) -> TripRead:
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)
    return TripRead.serialize(db_trip)


@router.post("", response_model=TripRead)
def create_trip(
    trip: TripCreate, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> TripRead:
    new_trip = Trip(
        name=trip.name,
        user=current_user,
    )

    if trip.image:
        image_bytes = b64img_decode(trip.image)
        filename = save_image_to_file(image_bytes, settings.TRIP_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, user=current_user)
        session.add(image)
        session.commit()
        session.refresh(image)
        new_trip.image_id = image.id

    if trip.place_ids:
        for place_id in trip.place_ids:
            db_place = session.get(Place, place_id)
            verify_exists_and_owns(current_user, db_place)
            session.add(TripPlaceLink(trip_id=new_trip.id, place_id=db_place.id))
        session.commit()

    session.add(new_trip)
    session.commit()
    session.refresh(new_trip)
    return TripRead.serialize(new_trip)


@router.put("/{trip_id}", response_model=TripRead)
def update_trip(
    session: SessionDep,
    trip_id: int,
    trip: TripUpdate,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripRead:
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)

    trip_data = trip.model_dump(exclude_unset=True)
    if trip_data.get("image"):
        try:
            image_bytes = b64img_decode(trip_data.pop("image"))
        except Exception:
            raise HTTPException(status_code=400, detail="Bad request")

        filename = save_image_to_file(image_bytes, settings.TRIP_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, user=current_user)
        session.add(image)
        session.commit()
        session.refresh(image)

        if db_trip.image_id:
            old_image = session.get(Image, db_trip.image_id)
            try:
                remove_image(old_image.filename)
                session.delete(old_image)
                db_trip.image_id = None
                session.refresh(db_trip)
            except Exception:
                raise HTTPException(status_code=400, detail="Bad request")

        db_trip.image_id = image.id

    if "place_ids" in trip_data:  # Could be empty [], so 'in'
        place_ids = trip_data.pop("place_ids")
        db_trip.places.clear()
        if place_ids:
            for place_id in place_ids:
                db_place = session.get(Place, place_id)
                verify_exists_and_owns(current_user, db_place)
                db_trip.places.append(db_place)

        item_place_ids = {
            item.place.id for day in db_trip.days for item in day.items if item.place is not None
        }
        invalid_place_ids = item_place_ids - set(place.id for place in db_trip.places)
        if invalid_place_ids:  # TripItem references a Place that Trip.places misses
            raise HTTPException(status_code=400, detail="Bad Request")

    for key, value in trip_data.items():
        setattr(db_trip, key, value)

    session.add(db_trip)
    session.commit()
    session.refresh(db_trip)
    return TripRead.serialize(db_trip)


@router.delete("/{trip_id}")
def delete_trip(
    session: SessionDep, trip_id: int, current_user: Annotated[str, Depends(get_current_username)]
):
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)

    if db_trip.image:
        try:
            remove_image(db_trip.image.filename)
            session.delete(db_trip.image)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Roses are red, violets are blue, if you're reading this, I'm sorry for you",
            )

    session.delete(db_trip)
    session.commit()
    return {}


@router.post("/{trip_id}/days", response_model=TripDayRead)
def create_tripday(
    td: TripDayBase,
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripDayRead:
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)

    new_day = TripDay(label=td.label, trip_id=trip_id, user=current_user)

    session.add(new_day)
    session.commit()
    session.refresh(new_day)
    return TripDayRead.serialize(new_day)


@router.put("/{trip_id}/days/{day_id}", response_model=TripDayRead)
def update_tripday(
    td: TripDayBase,
    trip_id: int,
    day_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripDayRead:
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)

    db_day = session.get(TripDay, day_id)
    verify_exists_and_owns(current_user, db_day)
    if db_day.trip_id != trip_id:
        raise HTTPException(status_code=400, detail="Bad request")

    td_data = td.model_dump(exclude_unset=True)
    for key, value in td_data.items():
        setattr(db_day, key, value)

    session.add(db_day)
    session.commit()
    session.refresh(db_day)
    return TripDayRead.serialize(db_day)


@router.delete("/{trip_id}/days/{day_id}")
def delete_tripday(
    session: SessionDep,
    trip_id: int,
    day_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)

    db_day = session.get(TripDay, day_id)
    verify_exists_and_owns(current_user, db_day)
    if db_day.trip_id != trip_id:
        raise HTTPException(status_code=400, detail="Bad request")

    session.delete(db_day)
    session.commit()
    return {}


@router.post("/{trip_id}/days/{day_id}/items", response_model=TripItemRead)
def create_tripitem(
    item: TripItemCreate,
    trip_id: int,
    day_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripItemRead:
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)

    db_day = session.get(TripDay, day_id)
    if db_day.trip_id != trip_id:
        raise HTTPException(status_code=400, detail="Bad request")

    new_item = TripItem(
        time=item.time,
        text=item.text,
        comment=item.comment,
        lat=item.lat,
        lng=item.lng,
        day_id=day_id,
        price=item.price,
        status=item.status,
    )

    if item.place and item.place != "":
        place_in_trip = any(place.id == item.place for place in db_trip.places)
        if not place_in_trip:
            raise HTTPException(status_code=400, detail="Bad request")
        new_item.place_id = item.place

    session.add(new_item)
    session.commit()
    session.refresh(new_item)
    return TripItemRead.serialize(new_item)


@router.put("/{trip_id}/days/{day_id}/items/{item_id}", response_model=TripItemRead)
def update_tripitem(
    item: TripItemUpdate,
    trip_id: int,
    day_id: int,
    item_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripItemRead:
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)

    db_day = session.get(TripDay, day_id)
    if db_day.trip_id != trip_id:
        raise HTTPException(status_code=400, detail="Bad request")

    db_item = session.get(TripItem, item_id)
    if db_item.day_id != day_id:
        raise HTTPException(status_code=400, detail="Bad request")

    if item.place:
        place_in_trip = any(place.id == item.place for place in db_trip.places)
        if not place_in_trip:
            raise HTTPException(status_code=400, detail="Bad request")

    item_data = item.model_dump(exclude_unset=True)
    if item_data.get("place"):
        place_id = item_data.pop("place")
        db_item.place_id = place_id

    for key, value in item_data.items():
        setattr(db_item, key, value)

    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return TripItemRead.serialize(db_item)


@router.delete("/{trip_id}/days/{day_id}/items/{item_id}")
def delete_tripitem(
    session: SessionDep,
    trip_id: int,
    day_id: int,
    item_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_trip = session.get(Trip, trip_id)
    verify_exists_and_owns(current_user, db_trip)

    db_day = session.get(TripDay, day_id)
    if db_day.trip_id != trip_id:
        raise HTTPException(status_code=400, detail="Bad request")

    db_item = session.get(TripItem, item_id)
    if db_item.day_id != day_id:
        raise HTTPException(status_code=400, detail="Bad request")

    session.delete(db_item)
    session.commit()
    return {}
