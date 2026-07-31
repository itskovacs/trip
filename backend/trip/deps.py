from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from .config import get_settings
from .db.core import get_engine
from .models.models import User
from .security import api_token_to_user

# auto_error=False so a missing Authorization header doesn't 401 before we get a
# chance to fall back to the X-Api-Token header below.
oauth_password_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def get_session():
    engine = get_engine()
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def _username_from_jwt(session: Session, token: str) -> str:
    try:
        payload = jwt.decode(token, get_settings().SECRET_KEY, algorithms=[get_settings().ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid Token")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid Token")

    user = session.get(User, username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid Token")
    return user.username


def get_current_username(
    session: SessionDep,
    token: Annotated[str | None, Depends(oauth_password_scheme)] = None,
    x_api_token: Annotated[str | None, Header(alias="X-Api-Token")] = None,
) -> str:
    if token:
        return _username_from_jwt(session, token)
    if x_api_token:
        return api_token_to_user(session, x_api_token).username
    raise HTTPException(status_code=401, detail="Not authenticated")


def require_admin(
    session: SessionDep, token: Annotated[str | None, Depends(oauth_password_scheme)] = None
) -> str:
    # Deliberately JWT-only: an API token must never satisfy admin routes, even for
    # an admin user's own token.
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    username = _username_from_jwt(session, token)
    db_user = session.get(User, username)
    if not db_user or not db_user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return db_user.username
