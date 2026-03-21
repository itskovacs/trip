---
sidebar_position: 2
description: Installing on Synology NAS using Docker and Portainer
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Installing on Synology NAS

## Prerequisites

- Synology NAS with Docker support
- [Docker](https://www.synology.com/en-us/dsm/packages/Docker) installed via Synology Package Center
- [Portainer](https://www.portainer.io/) (Community Edition) installed and running
- Basic knowledge of Synology DSM, Portainer, and network setup

## Step 1: Storage directory

Create a directory for persistent storage:

```bash
mkdir -p /volume1/docker/trip-storage
```

Alternatively, create the folder using Synology File Station

```
/volume1/docker/trip-storage
```

## Step 2: Deploy

<Tabs>
<TabItem value="dcompose" label="Docker Compose (Recommended)" default>

1. Open Portainer
2. Go to Stacks → Add Stack.
3. Name the stack (e.g., `trip`).
4. Paste this content:

```yaml
version: "3.9"
services:
  trip:
    container_name: trip
    image: ghcr.io/itskovacs/trip:1
    user: 1000:1000 # Adjust to your account PUID:PGID
    security_opt:
      - no-new-privileges:true
    volumes:
      - /volume1/docker/trip-storage:/app/storage # Adjust to storage dir
    restart: on-failure:5
    ports:
      - "8080:8000"
```

5. Click Deploy the stack.

</TabItem>
    
<TabItem value="manual" label="Docker run">

1. In Portainer, go to Containers → Add Container.
2. Fill out the following fields:

- **Name**: `trip`
- **Image**: `ghcr.io/itskovacs/trip:1`
- **Port mapping**: `8080` → `8000`
- **Volume mapping**:
  - Host: `/volume1/docker/trip-storage` (adjust to storage dir)
  - Container: `/app/storage`

3. Click Deploy the container.

</TabItem>
</Tabs>

## Step 3: Access the App

Open a browser and go to:

```
<YOUR_NAS>:8080
```

You should see the TRIP web interface.

## Step 4: Optional Configuration

:::note
TRIP supports advanced configuration via a `config.env` file or environment variables. See [Configuration](/docs/getting-started/configuration) for details.
:::

For your Synology, you can either:

- Edit or create `config.env` in `/volume1/docker/trip-storage`
- Set environment variables in your container settings via the Synology Docker or Portainer interface

:::tip
Changes require restarting the container to take effect
:::
