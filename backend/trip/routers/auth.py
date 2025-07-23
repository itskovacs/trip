import json

import jwt
from fastapi import APIRouter, Body, HTTPException
from jwt.algorithms import RSAAlgorithm

from ..config import settings
from ..db.core import init_user_data
from ..deps import SessionDep, get_oidc_client
from ..models.models import AuthParams, LoginRegisterModel, Token, User
from ..security import (create_access_token, create_tokens, hash_password,
                        verify_password)
from ..utils.utils import generate_filename, httpx_get

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/params", response_model=AuthParams)
async def auth_params() -> AuthParams:
    data = {"oidc": None, "register_enabled": settings.REGISTER_ENABLE}

    if settings.OIDC_HOST and settings.OIDC_CLIENT_ID and settings.OIDC_CLIENT_SECRET:
        oidc_complete_url = f"{settings.OIDC_PROTOCOL}://{settings.OIDC_HOST}/realms/{settings.OIDC_REALM}/protocol/openid-connect/auth?client_id={settings.OIDC_CLIENT_ID}&redirect_uri={settings.OIDC_REDIRECT_URI}&response_type=code&scope=openid"
        data["oidc"] = oidc_complete_url

    return data


@router.post("/oidc/login", response_model=Token)
async def oidc_login(session: SessionDep, code: str = Body(..., embed=True)) -> Token:
    if settings.AUTH_METHOD != "oidc":
        raise HTTPException(status_code=400, detail="Bad request")

    try:
        oidc_client = get_oidc_client()
        token = oidc_client.fetch_token(
            f"{settings.OIDC_PROTOCOL}://{settings.OIDC_HOST}/realms/{settings.OIDC_REALM}/protocol/openid-connect/token",
            grant_type="authorization_code",
            code=code,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="OIDC login failed")

    id_token = token.get("id_token")
    alg = jwt.get_unverified_header(id_token).get("alg")

    match alg:
        case "HS256":
            decoded = jwt.decode(
                id_token,
                settings.OIDC_CLIENT_SECRET,
                algorithms=alg,
                audience=settings.OIDC_CLIENT_ID,
            )
        case "RS256":
            config = await httpx_get(
                f"{settings.OIDC_PROTOCOL}://{settings.OIDC_HOST}/realms/{settings.OIDC_REALM}/.well-known/openid-configuration"
            )
            jwks_uri = config.get("jwks_uri")
            jwks = await httpx_get(jwks_uri)
            keys = jwks.get("keys")

            for key in keys:
                try:
                    pk = RSAAlgorithm.from_jwk(json.dumps(key))
                    decoded = jwt.decode(
                        id_token,
                        key=pk,
                        algorithms=alg,
                        audience=settings.OIDC_CLIENT_ID,
                        issuer=f"{settings.OIDC_PROTOCOL}://{settings.OIDC_HOST}/realms/{settings.OIDC_REALM}",
                    )
                    break
                except Exception:
                    continue
        case _:
            raise HTTPException(status_code=500, detail="OIDC login failed, algorithm not handled")

    if not decoded:
        raise HTTPException(status_code=401, detail="Invalid ID token")

    username = decoded.get("preferred_username")
    user = session.get(User, username)
    if not user:
        # TODO: password is non-null, we must init the pw with something, the model is not made for OIDC
        user = User(username=username, password=hash_password(generate_filename("find-something-else")))
        session.add(user)
        session.commit()
        init_user_data(session, username)

    return create_tokens(data={"sub": username})


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
