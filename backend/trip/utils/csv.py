import csv
from io import StringIO

from fastapi import UploadFile


async def iter_csv_lines(file: UploadFile):
    content = await file.read()
    decoded_content = content.decode("utf-8")

    csv_reader = csv.DictReader(StringIO(decoded_content))
    for row in csv_reader:
        yield row
