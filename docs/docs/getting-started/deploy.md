---
sidebar_position: 1
description: Deploy TRIP
---

# Deployment

Deployment is designed to be simple using Docker.
If you need help, feel free to open a [discussion](https://github.com/itskovacs/trip/discussions).

### Option 1: Docker Compose (Recommended)

Use the `docker-compose.yml` file provided in the repository. No changes are required, though you may customize it to suit your needs.

```bash
docker-compose up -d
```

### Option 2: Docker Run

```bash
# Ensure you have the latest image
docker pull ghcr.io/itskovacs/trip:1

# Run the container
docker run -d -p 8080:8000 -v ./storage:/app/storage ghcr.io/itskovacs/trip:1
```
