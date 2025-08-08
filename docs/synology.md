# 🗺️ Installing TRIP on Synology NAS Using Docker and Portainer

This guide explains how to deploy [TRIP](https://github.com/itskovacs/trip) on a Synology NAS using Docker and Portainer.  
TRIP is a minimalist, privacy-first map and POI tracking app that is fully self-hostable.

## 🧰 Prerequisites

- A Synology NAS with Docker support
- [Docker](https://www.synology.com/en-us/dsm/packages/Docker) installed via Synology Package Center
- [Portainer](https://www.portainer.io/) (Community Edition) installed and running
- Basic familiarity with Synology DSM, Portainer, and local network setup


## 📁 Step 1: Create a Storage Directory

Create a folder on your NAS to persist TRIP’s storage:

```bash
mkdir -p /volume1/docker/trip-storage
```

You can also do this via File Station by creating:

```
/volume1/docker/trip-storage
```


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
    image: ghcr.io/itskovacs/trip:1
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


### ⚙️ Option B: Manual Container (Docker Run Equivalent)

1. In **Portainer**, go to **Containers** → **Add Container**.
2. Fill out the following fields:

- **Name**: `trip`
- **Image**: `ghcr.io/itskovacs/trip:1`
- **Port mapping**: `8080` → `8000`
- **Volume mapping**:
  - Host: `/volume1/docker/trip-storage`
  - Container: `/app/storage`

3. Click **Deploy the container**.


## 🌐 Step 3: Access the App

Open a browser and go to:

```
http://<YOUR_NAS_IP>:8080
```

You should see the TRIP web interface.


## ⚙️ Step 4: Add Optional Configuration (e.g., Authentication)

> For authentication, theming, and more, refer to:  
> [TRIP Configuration Docs](https://github.com/itskovacs/trip#configuration)

TRIP supports advanced configuration via a `config.yml` file or using `environment variables`.

1. Modify configuration, two options:
    * Modify (or create) your `config.yml` inside `/volume1/docker/trip-storage`,
    * Modify the environment variables of your container
2. Restart container
