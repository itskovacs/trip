from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.gzip import GZipMiddleware

from . import __version__
from .config import settings
from .db.core import init_and_migrate_db
from .routers import auth, categories, places, providers
from .routers import settings as settings_r
from .routers import token, trips
from .utils.utils import silence_http_logging

if not Path(settings.FRONTEND_FOLDER).is_dir():
    raise ValueError()

Path(settings.ASSETS_FOLDER).mkdir(parents=True, exist_ok=True)
Path(settings.ATTACHMENTS_FOLDER).mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_and_migrate_db()
    silence_http_logging()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(places.router)
app.include_router(settings_r.router)
app.include_router(trips.router)
app.include_router(token.router)
app.include_router(providers.router)


@app.get("/api/info")
def info():
    return {"version": __version__}


@app.middleware("http")
async def not_found_to_spa(request: Request, call_next):
    response = await call_next(request)
    if response.status_code == 404 and not request.url.path.startswith(("/api", "/assets")):
        return FileResponse(Path(settings.FRONTEND_FOLDER) / "index.html")
    return response


app.mount("/api/assets", StaticFiles(directory=settings.ASSETS_FOLDER), name="static")
app.mount("/", StaticFiles(directory=settings.FRONTEND_FOLDER, html=True), name="frontend")
