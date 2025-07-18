# Node builder
FROM node:22 AS build
WORKDIR /app
COPY src/package.json ./
RUN npm install
COPY src .
RUN npm run build

# Server
FROM python:3.12-slim
WORKDIR /app
# Touch the files
COPY backend .
RUN pip install -r trip/requirements.txt
# Copy to /app/frontend, where /app has the backend python files also
COPY --from=build /app/dist/trip/browser ./frontend
EXPOSE 8080
CMD ["fastapi", "run", "/app/trip/main.py", "--host", "0.0.0.0", "--port", "8000"]