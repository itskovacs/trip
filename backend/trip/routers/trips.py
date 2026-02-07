from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import update
from sqlalchemy.orm import selectinload
from sqlmodel import select

from ..config import settings
from ..deps import SessionDep, get_current_username
from ..models.models import (Image, Place, Trip, TripAttachment,
                             TripAttachmentRead, TripChecklistItem,
                             TripChecklistItemCreate, TripChecklistItemRead,
                             TripChecklistItemUpdate, TripCreate, TripDay,
                             TripDayBase, TripDayRead, TripInvitationRead,
                             TripItem, TripItemCreate, TripItemRead,
                             TripItemUpdate, TripMember, TripMemberCreate,
                             TripMemberRead, TripPackingListItem,
                             TripPackingListItemCreate,
                             TripPackingListItemRead,
                             TripPackingListItemUpdate, TripRead, TripReadBase,
                             TripShare, TripShareURL, TripUpdate, User)
from ..utils.date import dt_utc
from ..utils.utils import (attachments_trip_folder_path, b64img_decode,
                           generate_urlsafe, save_attachment,
                           save_image_to_file)

router = APIRouter(prefix="/api/trips", tags=["trips"])


def _trip_from_token_or_404(session, token: str) -> TripShare:
    share = session.exec(select(TripShare).where(TripShare.token == token)).first()
    if not share:
        raise HTTPException(status_code=404, detail="Not found")
    return share


def _trip_usernames(session, trip_id: int) -> set[str]:
    owner = session.exec(select(Trip.user).where(Trip.id == trip_id)).first()
    members = session.exec(select(TripMember.user).where(TripMember.trip_id == trip_id)).all()
    return {owner} | set(members)


def _get_verified_trip(session, trip_id: int, username: str) -> Trip:
    # Merge of _verify_trip_member(+_can_access_trip) + _get_trip_or_404
    # Returns a Trip if: it exists and username is a TripMember or trip.user (owner)
    trip = session.exec(
        select(Trip)
        .outerjoin(TripMember)
        .where(
            Trip.id == trip_id,
            (Trip.user == username) | ((TripMember.user == username) & (TripMember.joined_at.is_not(None))),
        )
    ).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Not found")
    return trip


@router.get("", response_model=list[TripReadBase])
def read_trips(
    session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> list[TripReadBase]:
    trips = session.exec(
        select(Trip)
        .join(TripMember, isouter=True)
        .where(
            (Trip.user == current_user)
            | ((TripMember.user == current_user) & (TripMember.joined_at.is_not(None)))
        )
        .distinct()
    )
    return [TripReadBase.serialize(trip) for trip in trips]


@router.get("/invitations", response_model=list[TripInvitationRead])
def read_pending_invitations(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[TripInvitationRead]:
    pending_inviattions = session.exec(
        select(TripMember, Trip)
        .join(Trip, Trip.id == TripMember.trip_id)
        .where(
            TripMember.user == current_user,
            TripMember.joined_at.is_(None),
        )
    ).all()

    invitations: list[TripInvitationRead] = []
    for tm, trip in pending_inviattions:
        base = TripReadBase.serialize(trip)
        invitations.append(
            TripInvitationRead(
                **base.model_dump(),
                invited_by=tm.invited_by,
                invited_at=tm.invited_at,
            )
        )

    return invitations


@router.get("/invitations/pending", response_model=bool)
def has_pending_invitations(
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> bool:
    pending = session.exec(
        select(TripMember.id).where(TripMember.user == current_user, TripMember.joined_at.is_(None)).limit(1)
    ).first()
    return bool(pending)


@router.get("/{trip_id}", response_model=TripRead)
def read_trip(
    session: SessionDep, trip_id: int, current_user: Annotated[str, Depends(get_current_username)]
) -> TripRead:
    db_trip = session.exec(
        select(Trip)
        .options(
            selectinload(Trip.days).selectinload(TripDay.items),
            selectinload(Trip.places),
            selectinload(Trip.image),
            selectinload(Trip.memberships),
        )
        .outerjoin(TripMember)
        .where(
            Trip.id == trip_id,
            (Trip.user == current_user)
            | ((TripMember.user == current_user) & (TripMember.joined_at.is_not(None))),
        )
    ).first()

    if not db_trip:
        raise HTTPException(status_code=404, detail="Not found")
    return TripRead.serialize(db_trip)


@router.post("", response_model=TripReadBase)
def create_trip(
    trip: TripCreate, session: SessionDep, current_user: Annotated[str, Depends(get_current_username)]
) -> TripReadBase:
    new_trip = Trip(name=trip.name, currency=trip.currency, user=current_user)

    if trip.image:
        image_bytes = b64img_decode(trip.image)
        filename = save_image_to_file(image_bytes, settings.TRIP_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, user=current_user)
        session.add(image)
        session.flush()
        session.refresh(image)
        new_trip.image_id = image.id

    session.add(new_trip)
    session.commit()
    session.refresh(new_trip)
    return TripReadBase.serialize(new_trip)


@router.put("/{trip_id}", response_model=TripRead)
def update_trip(
    session: SessionDep,
    trip_id: int,
    trip: TripUpdate,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripRead:
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived and (trip.archived is not False):
        raise HTTPException(status_code=400, detail="Bad request")

    trip_data = trip.model_dump(exclude_unset=True)

    image_b64 = trip_data.pop("image", None)
    if image_b64:
        try:
            image_bytes = b64img_decode(image_b64)
        except Exception:
            raise HTTPException(status_code=400, detail="Bad request")

        filename = save_image_to_file(image_bytes, settings.TRIP_IMAGE_SIZE)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, user=current_user)
        session.add(image)
        session.flush()
        session.refresh(image)

        if db_trip.image_id:
            old_image = session.get(Image, db_trip.image_id)
            try:
                session.delete(old_image)
                db_trip.image_id = None
                session.refresh(db_trip)
            except Exception:
                raise HTTPException(status_code=400, detail="Bad request")

        db_trip.image_id = image.id

    place_ids = trip_data.pop("place_ids", None)
    if place_ids is not None:  # Could be empty [], so 'in'
        allowed_users = _trip_usernames(session, trip_id)
        new_places = []
        for place_id in place_ids:
            db_place = session.get(Place, place_id)
            if not db_place:
                raise HTTPException(status_code=404, detail="Not found")
            if db_place.user not in allowed_users:
                raise HTTPException(status_code=403, detail="Place not accessible by trip members")
            new_places.append(db_place)
        db_trip.places = new_places

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
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    if db_trip.image:
        try:
            session.delete(db_trip.image)
        except Exception:
            raise HTTPException(
                status_code=500,
                detail="Roses are red, violets are blue, if you're reading this, I'm sorry for you",
            )

    session.delete(db_trip)
    session.commit()
    return {}


@router.get("/{trip_id}/balance")
def get_trip_balance(
    session: SessionDep,
    trip_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _get_verified_trip(session, trip_id, current_user)

    members = _trip_usernames(session, trip_id)
    if len(members) < 2:
        raise HTTPException(status_code=400, detail="Bad request")

    trip_items = session.exec(
        select(TripItem.price, TripItem.paid_by)
        .join(TripDay)
        .where(TripDay.trip_id == trip_id, TripItem.price.is_not(None), TripItem.paid_by.is_not(None))
    ).all()

    paid_by_map = {m: 0 for m in members}
    for item in trip_items:
        if not item.price or not item.paid_by:
            continue
        paid_by_map[item.paid_by] += item.price
    xpected_per_person = sum(paid_by_map.values()) / len(members)

    return {member: paid_by_map[member] - xpected_per_person for member in paid_by_map}


@router.post("/{trip_id}/days", response_model=TripDayRead)
def create_tripday(
    td: TripDayBase,
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripDayRead:
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    new_day = TripDay(label=td.label, dt=td.dt, trip_id=trip_id)

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
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    db_day = session.get(TripDay, day_id)
    if not db_day or (db_day.trip_id != trip_id):
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
    trip_id: int,
    day_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    db_day = session.get(TripDay, day_id)
    if not db_day or (db_day.trip_id != trip_id):
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
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    db_day = session.get(TripDay, day_id)
    if not db_day or (db_day.trip_id != trip_id):
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

    if item.image:
        image_bytes = b64img_decode(item.image)
        filename = save_image_to_file(image_bytes, 0)
        if not filename:
            raise HTTPException(status_code=400, detail="Bad request")

        image = Image(filename=filename, user=current_user)
        session.add(image)
        session.flush()
        session.refresh(image)
        new_item.image_id = image.id

    if item.place is not None:
        place_in_trip = any(place.id == item.place for place in db_trip.places)
        if not place_in_trip:
            raise HTTPException(status_code=400, detail="Bad request")
        new_item.place_id = item.place

    if item.paid_by:
        if db_trip.user != item.paid_by:
            is_member = item.paid_by in _trip_usernames(session, trip_id)
            if not is_member:
                raise HTTPException(status_code=400, detail="User is not a trip member")

        new_item.paid_by = item.paid_by

    if item.attachment_ids:
        attachments = session.exec(
            select(TripAttachment)
            .where(TripAttachment.id.in_(item.attachment_ids))
            .where(TripAttachment.trip_id == trip_id)
        ).all()

        if len(attachments) != len(item.attachment_ids):
            raise HTTPException(status_code=400, detail="One or more attachments not found in trip")

        new_item.attachments = list(attachments)

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
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    db_day = session.get(TripDay, day_id)
    if not db_day or (db_day.trip_id != trip_id):
        raise HTTPException(status_code=400, detail="Bad request")

    db_item = session.get(TripItem, item_id)
    if not db_item or (db_item.day_id != day_id):
        raise HTTPException(status_code=400, detail="Bad request")

    item_data = item.model_dump(exclude_unset=True)
    # TODO: Optimize logic; image=data: parse / image=none: remove / no image key: pass
    if "image" in item_data:  # no image key: pass
        image_b64 = item_data.pop("image", None)  # image=data: parse
        if image_b64:
            try:
                image_bytes = b64img_decode(image_b64)
            except Exception:
                raise HTTPException(status_code=400, detail="Bad request")

            filename = save_image_to_file(image_bytes, 0)
            if not filename:
                raise HTTPException(status_code=400, detail="Bad request")

            image = Image(filename=filename, user=current_user)
            session.add(image)
            session.flush()
            session.refresh(image)

            if db_item.image_id:
                old_image = session.get(Image, db_item.image_id)
                try:
                    session.delete(old_image)
                    db_item.image_id = None
                    session.refresh(db_item)
                except Exception:
                    raise HTTPException(status_code=400, detail="Bad request")

            db_item.image_id = image.id

        else:  # image=none: remove if previous
            if getattr(db_item, "image_id", None):
                old_image = session.get(Image, db_item.image_id)
                try:
                    session.delete(old_image)
                    db_item.image_id = None
                    session.refresh(db_item)
                except Exception:
                    raise HTTPException(status_code=400, detail="Bad request")

    place_id = item_data.pop("place", None)
    db_item.place_id = place_id
    if place_id is not None:
        place_in_trip = any(p.id == place_id for p in db_trip.places)
        if not place_in_trip:
            raise HTTPException(status_code=400, detail="Bad request")

    if "paid_by" in item_data:
        paid_by = item_data.pop("paid_by")
        if paid_by:
            if paid_by != db_trip.user:
                is_member = item.paid_by in _trip_usernames(session, trip_id)
                if not is_member:
                    raise HTTPException(status_code=400, detail="User is not a trip member")
            db_item.paid_by = paid_by
        else:
            db_item.paid_by = None

    attachment_ids = item_data.pop("attachment_ids", None)
    if attachment_ids is not None:  # Could be empty [], so 'in'
        if attachment_ids:
            attachments = session.exec(
                select(TripAttachment)
                .where(TripAttachment.id.in_(attachment_ids))
                .where(TripAttachment.trip_id == trip_id)
            ).all()

            if len(attachments) != len(attachment_ids):
                raise HTTPException(status_code=400, detail="One or more attachments not found in trip")

            db_item.attachments = list(attachments)
        else:
            db_item.attachments = []

    for key, value in item_data.items():
        setattr(db_item, key, value)

    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return TripItemRead.serialize(db_item)


@router.delete("/{trip_id}/days/{day_id}/items/{item_id}")
def delete_tripitem(
    trip_id: int,
    day_id: int,
    item_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    db_day = session.get(TripDay, day_id)
    if not db_day or (db_day.trip_id != trip_id):
        raise HTTPException(status_code=400, detail="Bad request")

    db_item = session.get(TripItem, item_id)
    if not db_item or (db_item.day_id != day_id):
        raise HTTPException(status_code=400, detail="Bad request")

    session.delete(db_item)
    session.commit()
    return {}


@router.get("/shared/{token}", response_model=TripRead)
def read_shared_trip(
    session: SessionDep,
    token: str,
) -> TripRead:
    db_trip = session.get(Trip, _trip_from_token_or_404(session, token).trip_id)
    return TripRead.serialize(db_trip)


@router.get("/{trip_id}/share", response_model=TripShareURL)
def get_shared_trip_url(
    session: SessionDep,
    trip_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripShareURL:
    _get_verified_trip(session, trip_id, current_user)

    share = session.exec(select(TripShare).where(TripShare.trip_id == trip_id)).first()
    if not share:
        raise HTTPException(status_code=404, detail="Not found")

    return {"url": f"/s/t/{share.token}"}


@router.post("/{trip_id}/share", response_model=TripShareURL)
def create_shared_trip(
    session: SessionDep,
    trip_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripShareURL:
    _get_verified_trip(session, trip_id, current_user)

    shared = session.exec(select(TripShare).where(TripShare.trip_id == trip_id)).first()
    if shared:
        raise HTTPException(status_code=409, detail="The resource already exists")

    token = generate_urlsafe()
    trip_share = TripShare(token=token, trip_id=trip_id)
    session.add(trip_share)
    session.commit()
    return {"url": f"/s/t/{token}"}


@router.delete("/{trip_id}/share")
def delete_shared_trip(
    session: SessionDep,
    trip_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _get_verified_trip(session, trip_id, current_user)

    db_share = session.exec(select(TripShare).where(TripShare.trip_id == trip_id)).first()
    if not db_share:
        raise HTTPException(status_code=404, detail="Not found")

    session.delete(db_share)
    session.commit()
    return {}


@router.get("/{trip_id}/packing", response_model=list[TripPackingListItemRead])
def read_packing_list(
    session: SessionDep,
    trip_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[TripPackingListItemRead]:
    _get_verified_trip(session, trip_id, current_user)
    p_items = session.exec(select(TripPackingListItem).where(TripPackingListItem.trip_id == trip_id))

    return [TripPackingListItemRead.serialize(i) for i in p_items]


@router.get("/shared/{token}/packing", response_model=list[TripPackingListItemRead])
def read_shared_trip_packing_list(
    session: SessionDep,
    token: str,
) -> list[TripPackingListItemRead]:
    p_items = session.exec(
        select(TripPackingListItem).where(
            TripPackingListItem.trip_id == _trip_from_token_or_404(session, token).trip_id
        )
    )
    return [TripPackingListItemRead.serialize(i) for i in p_items]


@router.post("/{trip_id}/packing", response_model=TripPackingListItemRead)
def create_packing_item(
    session: SessionDep,
    trip_id: int,
    data: TripPackingListItemCreate,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripPackingListItemRead:
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    item = TripPackingListItem(**data.model_dump(), trip_id=trip_id)
    session.add(item)
    session.commit()
    session.refresh(item)
    return TripPackingListItemRead.serialize(item)


@router.put("/{trip_id}/packing/{p_id}", response_model=TripPackingListItemRead)
def update_packing_item(
    session: SessionDep,
    p_item: TripPackingListItemUpdate,
    trip_id: int,
    p_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripPackingListItemRead:
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    db_item = session.exec(
        select(TripPackingListItem).where(
            TripPackingListItem.id == p_id, TripPackingListItem.trip_id == trip_id
        )
    ).one_or_none()

    if not db_item:
        raise HTTPException(status_code=404, detail="Not found")

    item_data = p_item.model_dump(exclude_unset=True)
    for key, value in item_data.items():
        setattr(db_item, key, value)

    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return TripPackingListItemRead.serialize(db_item)


@router.delete("/{trip_id}/packing/{p_id}")
def delete_packing_item(
    session: SessionDep,
    trip_id: int,
    p_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    item = session.exec(
        select(TripPackingListItem).where(
            TripPackingListItem.id == p_id, TripPackingListItem.trip_id == trip_id
        )
    ).one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    session.delete(item)
    session.commit()
    return {}


@router.get("/{trip_id}/checklist", response_model=list[TripChecklistItemRead])
def read_checklist(
    session: SessionDep,
    trip_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> list[TripChecklistItemRead]:
    _get_verified_trip(session, trip_id, current_user)
    items = session.exec(select(TripChecklistItem).where(TripChecklistItem.trip_id == trip_id))
    return [TripChecklistItemRead.serialize(i) for i in items]


@router.get("/shared/{token}/checklist", response_model=list[TripChecklistItemRead])
def read_shared_trip_checklist(
    session: SessionDep,
    token: str,
) -> list[TripChecklistItemRead]:
    items = session.exec(
        select(TripChecklistItem).where(
            TripChecklistItem.trip_id == _trip_from_token_or_404(session, token).trip_id
        )
    )
    return [TripChecklistItemRead.serialize(i) for i in items]


@router.post("/{trip_id}/checklist", response_model=TripChecklistItemRead)
def create_checklist_item(
    session: SessionDep,
    trip_id: int,
    data: TripChecklistItemCreate,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripChecklistItemRead:
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    item = TripChecklistItem(**data.model_dump(), trip_id=trip_id)
    session.add(item)
    session.commit()
    session.refresh(item)
    return TripChecklistItemRead.serialize(item)


@router.put("/{trip_id}/checklist/{id}", response_model=TripChecklistItemRead)
def update_checklist_item(
    session: SessionDep,
    item: TripChecklistItemUpdate,
    trip_id: int,
    id: int,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripChecklistItemRead:
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    db_item = session.exec(
        select(TripChecklistItem).where(TripChecklistItem.id == id, TripChecklistItem.trip_id == trip_id)
    ).one_or_none()

    if not db_item:
        raise HTTPException(status_code=404, detail="Not found")

    item_data = item.model_dump(exclude_unset=True)
    for key, value in item_data.items():
        setattr(db_item, key, value)

    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return TripChecklistItemRead.serialize(db_item)


@router.delete("/{trip_id}/checklist/{id}")
def delete_checklist_item(
    session: SessionDep,
    trip_id: int,
    id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    item = session.exec(
        select(TripChecklistItem).where(
            TripChecklistItem.id == id,
            TripChecklistItem.trip_id == trip_id,
        )
    ).one_or_none()

    if not item:
        raise HTTPException(status_code=404, detail="Not found")

    session.delete(item)
    session.commit()
    return {}


@router.get("/{trip_id}/members", response_model=list[TripMemberRead])
def read_trip_members(
    session: SessionDep, trip_id: int, current_user: Annotated[str, Depends(get_current_username)]
) -> list[TripMemberRead]:
    _get_verified_trip(session, trip_id, current_user)

    members: list[TripMemberRead] = []
    owner = session.exec(select(Trip.user).where(Trip.id == trip_id)).first()
    members.append(TripMemberRead(user=owner, invited_by=None, invited_at=None, joined_at=None))

    db_members = session.exec(select(TripMember).where(TripMember.trip_id == trip_id)).all()
    members.extend(TripMemberRead.serialize(m) for m in db_members)
    return members


@router.post("/{trip_id}/members", response_model=TripMemberRead)
def invite_trip_member(
    session: SessionDep,
    trip_id: int,
    data: TripMemberCreate,
    current_user: Annotated[str, Depends(get_current_username)],
) -> TripMemberRead:
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    if db_trip.user == data.user:
        raise HTTPException(status_code=409, detail="The resource already exists")

    exists = session.exec(
        select(TripMember.id)
        .where(
            TripMember.trip_id == trip_id,
            TripMember.user == data.user,
        )
        .limit(1)
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="The resource already exists")

    db_user = session.get(User, data.user)
    if not db_user:
        raise HTTPException(status_code=404, detail="Not found")

    new_member = TripMember(trip_id=trip_id, user=data.user, invited_by=current_user)
    session.add(new_member)
    session.commit()
    session.refresh(new_member)
    return TripMemberRead.serialize(new_member)


@router.delete("/{trip_id}/members/{username}")
def delete_trip_member(
    session: SessionDep,
    trip_id: int,
    username: str,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_trip = _get_verified_trip(session, trip_id, current_user)

    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    if current_user == db_trip.user and current_user == username:
        raise HTTPException(status_code=400, detail="Bad request")

    if current_user != db_trip.user and current_user != username:
        raise HTTPException(status_code=403, detail="Forbidden")

    member = session.exec(
        select(TripMember).where(
            TripMember.user == username,
            TripMember.trip_id == trip_id,
        )
    ).one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Not found")

    # Set NULL to TripItem.paid_by for this username
    trip_items = session.exec(
        select(TripItem.id).join(TripDay).where(TripDay.trip_id == trip_id, TripItem.paid_by == username)
    ).all()

    if trip_items:
        session.exec(update(TripItem).where(TripItem.id.in_([id for id in trip_items])).values(paid_by=None))

    session.delete(member)
    session.commit()
    return {}


@router.post("/{trip_id}/members/accept")
def accept_invite(
    session: SessionDep,
    trip_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_member = session.exec(
        select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user == current_user)
    ).one_or_none()
    if not db_member:
        raise HTTPException(status_code=404, detail="Not found")
    if db_member.joined_at:
        raise HTTPException(status_code=409, detail="Already a member")
    db_member.joined_at = dt_utc()
    session.add(db_member)
    session.commit()
    return {}


@router.post("/{trip_id}/members/decline")
def decline_invite(
    session: SessionDep,
    trip_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_member = session.exec(
        select(TripMember).where(TripMember.trip_id == trip_id, TripMember.user == current_user)
    ).one_or_none()
    if not db_member:
        raise HTTPException(status_code=404, detail="Not found")
    if db_member.joined_at:
        raise HTTPException(status_code=409, detail="Already a member")
    session.delete(db_member)
    session.commit()
    return {}


@router.post("/{trip_id}/attachments", response_model=TripAttachmentRead)
async def create_trip_attachment(
    trip_id: int,
    session: SessionDep,
    current_user: Annotated[str, Depends(get_current_username)],
    file: UploadFile = File(...),
):
    db_trip = _get_verified_trip(session, trip_id, current_user)
    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    db_attachment = TripAttachment(
        filename=file.filename,
        content_type=file.content_type,
        file_size=file.size,
        uploaded_by=current_user,
        trip_id=trip_id,
    )
    stored_filename = await save_attachment(trip_id, file)
    if not stored_filename:
        raise HTTPException(status_code=400, detail="Bad request")

    db_attachment.stored_filename = stored_filename
    session.add(db_attachment)
    session.commit()
    session.refresh(db_attachment)
    return TripAttachmentRead.serialize(db_attachment)


@router.get("/{trip_id}/attachments/{attachment_id}/download")
async def download_trip_attachment(
    session: SessionDep,
    trip_id: int,
    attachment_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    _get_verified_trip(session, trip_id, current_user)
    attachment = session.get(TripAttachment, attachment_id)
    if not attachment or attachment.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    file_path = attachments_trip_folder_path(trip_id) / attachment.stored_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment not found")

    return FileResponse(path=file_path, filename=attachment.filename, media_type="application/pdf")


@router.get("/shared/{token}/attachments/{attachment_id}/download")
async def download_shared_trip_attachment(
    session: SessionDep,
    token: str,
    attachment_id: int,
):
    _trip = _trip_from_token_or_404(session, token)
    attachment = session.exec(
        select(TripAttachment).where(
            TripAttachment.trip_id == _trip.trip_id, TripAttachment.id == attachment_id
        )
    ).first()

    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    file_path = attachments_trip_folder_path(_trip.trip_id) / attachment.stored_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Attachment not found")

    return FileResponse(path=file_path, filename=attachment.filename, media_type="application/pdf")


@router.delete("/{trip_id}/attachments/{attachment_id}")
async def delete_trip_attachment(
    session: SessionDep,
    trip_id: int,
    attachment_id: int,
    current_user: Annotated[str, Depends(get_current_username)],
):
    db_trip = _get_verified_trip(session, trip_id, current_user)
    if db_trip.archived:
        raise HTTPException(status_code=400, detail="Bad request")

    attachment = session.get(TripAttachment, attachment_id)
    if not attachment or attachment.trip_id != trip_id:
        raise HTTPException(status_code=404, detail="Attachment not found")

    session.delete(attachment)
    session.commit()
    return {}
