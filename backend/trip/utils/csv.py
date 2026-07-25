import csv
import logging
import re
from io import StringIO

from fastapi import HTTPException, UploadFile

logger = logging.getLogger(__name__)

# Matches the shapes Google Maps URLs take in a Takeout "Saved places" CSV
# export (regular maps.google.com/google.<tld>/maps links, and goo.gl /
# maps.app.goo.gl short links). Used as a content-based fallback to find the
# URL column when the header isn't literally named "URL" (localized exports).
_GOOGLE_MAPS_URL_RE = re.compile(
    r"^https?://(?:(?:www\.)?google\.[a-z.]{2,24}/maps|maps\.app\.goo\.gl/|goo\.gl/maps)",
    re.IGNORECASE,
)


async def iter_csv_lines(file: UploadFile):
    content = await file.read()
    decoded_content = content.decode("utf-8")

    csv_reader = csv.DictReader(StringIO(decoded_content))
    for row in csv_reader:
        yield row


async def extract_takeout_urls(file: UploadFile) -> list[str]:
    content = await file.read()
    try:
        decoded_content = content.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="Unable to decode CSV file as UTF-8")

    reader = csv.DictReader(StringIO(decoded_content))
    fieldnames = reader.fieldnames or []
    rows = list(reader)

    if not fieldnames:
        raise HTTPException(status_code=422, detail="CSV file has no header row")

    url_column = None
    for field in fieldnames:
        if field and field.strip().lower() == "url":
            url_column = field
            break

    if url_column is None:
        best_column = None
        best_score = 0
        for field in fieldnames:
            values = [row.get(field, "").strip() for row in rows if row.get(field)]
            if not values:
                continue
            matches = sum(1 for v in values if _GOOGLE_MAPS_URL_RE.match(v))
            if matches and matches == len(values) and matches > best_score:
                best_column = field
                best_score = matches
        url_column = best_column

    if url_column is None:
        logger.warning("[TAKEOUT IMPORT]: Could not detect a URL column in CSV headers: %s", fieldnames)
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not find a URL column in the CSV file. Make sure this is an "
                "unmodified Google Takeout 'Saved places' export."
            ),
        )

    return [row[url_column].strip() for row in rows if row.get(url_column)]
