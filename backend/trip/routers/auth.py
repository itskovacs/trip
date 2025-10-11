import jwt
from fastapi import APIRouter, Body, Cookie, HTTPException
from fastapi.responses import JSONResponse

from ..config import settings
from ..db.core import init_user_data
from ..deps import SessionDep
from ..models.models import AuthParams, LoginRegisterModel, Token, User
from ..security import (create_access_token, create_tokens, get_oidc_client,
                        get_oidc_config, hash_password, verify_password)
from ..utils.utils import generate_filename

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/params", response_model=AuthParams)
async def auth_params() -> AuthParams:
    data = {"oidc": None, "register_enabled": settings.REGISTER_ENABLE}

    if not (settings.OIDC_CLIENT_ID and settings.OIDC_CLIENT_SECRET):
        return {"oidc": None, "register_enabled": settings.REGISTER_ENABLE}

    oidc_config = await get_oidc_config()
    auth_endpoint = oidc_config.get("authorization_endpoint")
    uri, state = get_oidc_client().create_authorization_url(auth_endpoint)
    data["oidc"] = uri

    response = JSONResponse(content=data)
    response.set_cookie("oidc_state", value=state, httponly=True, secure=True, samesite="Lax", max_age=60)

    return response


@router.post("/oidc/login", response_model=Token)
async def oidc_login(
    session: SessionDep,
    code: str = Body(..., embed=True),
    state: str = Body(..., embed=True),
    oidc_state: str = Cookie(None),
) -> Token:
    if not (settings.OIDC_CLIENT_ID or settings.OIDC_CLIENT_SECRET):
        raise HTTPException(status_code=400, detail="Partial OIDC config")

    if not oidc_state or state != oidc_state:
        raise HTTPException(status_code=400, detail="OIDC login failed, invalid state")

    oidc_config = await get_oidc_config()
    token_endpoint = oidc_config.get("token_endpoint")
    try:
        oidc_client = get_oidc_client()
        token = oidc_client.fetch_token(
            token_endpoint,
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
                algorithms=["HS256"],
                audience=settings.OIDC_CLIENT_ID,
            )
        case "RS256":
            jwks_uri = oidc_config.get("jwks_uri")
            issuer = oidc_config.get("issuer")
            jwks_client = jwt.PyJWKClient(jwks_uri)

            try:
                signing_key = jwks_client.get_signing_key_from_jwt(id_token)
                decoded = jwt.decode(
                    id_token,
                    key=signing_key.key,
                    algorithms=["RS256"],
                    audience=settings.OIDC_CLIENT_ID,
                    issuer=issuer,
                )
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid ID token")
        case _:
            raise HTTPException(status_code=500, detail="OIDC login failed, algorithm not handled")

    if not decoded:
        raise HTTPException(status_code=401, detail="Invalid ID token")

    username = decoded.get("preferred_username")
    if not username:
        raise HTTPException(status_code=401, detail="OIDC login failed, preferred_username missing")

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
    if settings.OIDC_CLIENT_ID or settings.OIDC_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="OIDC is configured")

    db_user = session.get(User, req.username)
    if not db_user or not verify_password(req.password, db_user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return create_tokens(data={"sub": db_user.username})


@router.post("/register", response_model=Token)
def register(req: LoginRegisterModel, session: SessionDep) -> Token:
    if not settings.REGISTER_ENABLE:
        raise HTTPException(status_code=400, detail="Registration disabled")

    if settings.OIDC_CLIENT_ID or settings.OIDC_CLIENT_SECRET:
        raise HTTPException(status_code=400, detail="OIDC is configured")

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

        if not username:
            raise HTTPException(status_code=401, detail="Invalid Token")

        new_access_token = create_access_token(data={"sub": username})

        return {"access_token": new_access_token}

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Invalid Token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid Token")
