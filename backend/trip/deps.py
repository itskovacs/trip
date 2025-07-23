from typing import Annotated

import jwt
from authlib.integrations.httpx_client import OAuth2Client
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlmodel import Session

from .config import settings
from .db.core import get_engine
from .models.models import User

oauth_password_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_session():
    engine = get_engine()
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def get_current_username(token: Annotated[str, Depends(oauth_password_scheme)], session: SessionDep) -> str:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid Token")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid Token")

    user = session.get(User, username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid Token")
    return user.username


def get_oidc_client():
    return OAuth2Client(
        client_id=settings.OIDC_CLIENT_ID,
        client_secret=settings.OIDC_CLIENT_SECRET,
        scope="openid",
        redirect_uri=settings.OIDC_REDIRECT_URI,
    )
