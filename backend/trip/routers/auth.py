import jwt
from fastapi import APIRouter, Body, HTTPException

from ..config import settings
from ..db.core import init_user_data
from ..deps import SessionDep
from ..models.models import LoginRegisterModel, Token, User
from ..security import (create_access_token, create_tokens, hash_password,
                        verify_password)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(req: LoginRegisterModel, session: SessionDep) -> Token:
    db_user = session.get(User, req.username)
    if not db_user or not verify_password(req.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return create_tokens(data={"sub": db_user.username})


@router.post("/register", response_model=Token)
def register(req: LoginRegisterModel, session: SessionDep) -> Token:
    db_user = session.get(User, req.username)
    if db_user:
        raise HTTPException(status_code=409, detail="The resource already exists")

    new_user = User(username=req.username, password=hash_password(req.password))
    session.add(new_user)
    session.commit()

    init_user_data(session, new_user.username)

    return create_tokens(data={"sub": new_user.username})


@router.post("/refresh")
def refresh_token(refresh_token: str = Body(..., embed=True)):
    if not refresh_token:
        raise HTTPException(status_code=400, detail="Refresh token expected")

    try:
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub", None)

        if username is None:
            raise HTTPException(status_code=401, detail="Invalid Token")

        new_access_token = create_access_token(data={"sub": username})

        return {"access_token": new_access_token}

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Invalid Token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid Token")
