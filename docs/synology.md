# 🗺️ Installing TRIP on Synology NAS Using Docker and Portainer

This guide explains how to deploy [TRIP](https://github.com/itskovacs/trip) on a Synology NAS using Docker and Portainer. TRIP is a minimalist, privacy-first map and POI tracking app that is fully self-hostable.

---

## 🧰 Prerequisites

- A Synology NAS with Docker support
- [Docker](https://www.synology.com/en-us/dsm/packages/Docker) installed via Synology Package Center
- [Portainer](https://www.portainer.io/) (Community Edition) installed and running
- Basic familiarity with Synology DSM, Portainer, and local network setup

---

## 📁 Step 1: Create a Storage Directory

Create a folder on your NAS to persist TRIP’s storage:

```bash
mkdir -p /volume1/docker/trip-storage
```

You can also do this via File Station by creating:

```
/volume1/docker/trip-storage
```

---

## 🚀 Step 2: Deploy TRIP in Portainer

### ✅ Option A: Docker Compose (Recommended)

1. Open **Portainer**.
2. Go to **Stacks** → **Add Stack**.
3. Name your stack (e.g., `trip`).
4. Paste the following:

```yaml
version: '3.9'
services:
  trip:
    container_name: trip
    image: ghcr.io/itskovacs/trip:latest
    user: 1000:1000 #change these values to match those of your synology setup PUID:PGID
    security_opt:
      - no-new-privileges:true
    volumes:
      - /volume1/docker/trip-storage:/app/storage
    restart: on-failure:5
    ports:
      - "8080:8000"
```

5. Click **Deploy the stack**.

---

### ⚙️ Option B: Manual Container (Docker Run Equivalent)

1. In **Portainer**, go to **Containers** → **Add Container**.
2. Fill out the following fields:

- **Name**: `trip`
- **Image**: `ghcr.io/itskovacs/trip:latest`
- **Port mapping**: `8080` → `8000`
- **Volume mapping**:
  - Host: `/volume1/docker/trip-storage`
  - Container: `/app/storage`

3. Click **Deploy the container**.

---

## 🌐 Step 3: Access the App

Open a browser and go to:

```
http://<YOUR_NAS_IP>:8080
```

You should see the TRIP web interface.

---

## ⚙️ Step 4: Add Optional Configuration (e.g., Authentication)

TRIP supports advanced configuration via a `config.yml` file. To enable it:

1. Place your `config.yml` inside `/volume1/docker/trip-storage`.
2. The app will detect it automatically on container restart.

> For authentication, theming, and more, refer to:  
> [TRIP Configuration Docs](https://github.com/itskovacs/trip#configuration)

---

## 🧯 Troubleshooting

- **Can’t access the app?**
  - Ensure the NAS IP is correct and port 8080 is not blocked.
- **Data not saving?**
  - Confirm that the `/app/storage` volume is mapped properly.
- **Need to upgrade?**
  - Edit the image tag in your Docker Compose or Container to the new version and redeploy.

---

## 📌 Example Quick Reference

| Item           | Value                                 |
|----------------|---------------------------------------|
| App URL        | `http://<NAS-IP>:8080`                |
| Docker Image   | `ghcr.io/itskovacs/trip:latest`       |
| Storage Path   | `/volume1/docker/trip-storage`        |
| Port Mapping   | `8080:8000`                           |

---

## ✅ Final Notes

- [TRIP GitHub Repo](https://github.com/itskovacs/trip)
- [Latest Release](https://github.com/itskovacs/trip/releases)
- If using a reverse proxy (e.g., Synology Application Portal or NGINX), map `/` to port `8080`.
