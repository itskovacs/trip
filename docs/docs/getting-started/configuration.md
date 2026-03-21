---
sidebar_position: 2
description: Configure TRIP
---

# Configuration

You can modify the configuration by setting values in the `storage/config.env` file.

:::warning
The `config.env` file is not created automatically because the server uses default values. After editing `config.env`, restart the container for the changes to take effect.
:::

:::tip
Setting environment variable in `docker-compose.yml` also work. e.g.

```yaml
environment:
  REGISTER_ENABLE: "false"
```

:::

:::tip
You can edit the settings directly through the web interface.
:::

## General

### Image default size

By default, images are resized to `500px` for places and `600px` for trips. You can override these default values by setting them in the `config.env`:

:::warning
Higher numbers will lead to higher disk usage.
:::

```yaml title="storage/config.env"
PLACE_IMAGE_SIZE=500
TRIP_IMAGE_SIZE=600
```

### Map defaults

You can configure the default values for new users with the following settings: `DEFAULT_TILE`, `DEFAULT_CURRENCY`, `DEFAULT_MAP_LAT`, `DEFAULT_MAP_LNG`.

- `DEFAULT_TILE`: default map tile layer URL
- `DEFAULT_CURRENCY`: default currency symbol
- `DEFAULT_MAP_LAT`: default latitude when opening TRIP
- `DEFAULT_MAP_LNG`: default longitude when opening TRIP

:::warning
Changing these values does not update settings for existing users, it only affects new users.
:::

### Attachment max size

Trips hold attachments, the default maximum size for each is _10 MB_.

:::warning
You might need to change your webserver maximum body size as well (e.g. _Nginx_: `client_max_body_size`, _Caddy_: `request_body`, etc.)
:::

```yaml title="storage/config.env"
ATTACHMENT_MAX_SIZE=10485760 # 10 MB
```

### Files and folders

Inside your `storage` directory, TRIP uses 4 folders: `attachments`, `backups`, `assets`, `frontend` and one file `trip.sqlite`. Their path can be changed if needed:

```yaml title="storage/config.env"
ATTACHMENTS_FOLDER="storage/attachments"
BACKUPS_FOLDER="storage/backups"
ASSETS_FOLDER="storage/assets"
FRONTEND_FOLDER="frontend"
SQLITE_FILE="storage/trip.sqlite"
```

## Authentication

### Token duration

To modify the token lifespan, edit `ACCESS_TOKEN_EXPIRE_MINUTES` for the _Access Token_ and `REFRESH_TOKEN_EXPIRE_MINUTES` for the _Refresh Token_.
By default, the _Refresh Token_ expires after `1440` minutes (24 hours), and the _Access Token_ after `30` minutes.

```yaml title="storage/config.env"
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_MINUTES=1440
```

### OIDC Auth

```yaml title="storage/config.env"
OIDC_DISCOVERY_URL="https://sso.yourdomain.lan/.well-known/openid-configuration"
OIDC_CLIENT_ID="your-client-id"
OIDC_CLIENT_SECRET="your-client-secret"
OIDC_REDIRECT_URI="https://trip.yourdomain.lan/auth"
```

:::warning
If you have an error, please check the [Troubleshooting](#troubleshooting) section
:::

### Disable registration

The key `REGISTER_ENABLE` can be configured to `false` to disable registration.

## Troubleshooting

### SSL Error / Certificate

One way to check if you're concerned by this is simply doing the following and checking the result:

```dockerfile
$ docker run --rm -it ghcr.io/itskovacs/trip:1 /bin/bash
$ python3
>>> import httpx
>>> httpx.get("https://sso.yourdomain.lan/")
```

In case you're facing this issue, it's likely due to the fact that the container does not trust you custom certificate.

To fix this, I recommend you to build your own image with the certificate, based on the latest package.

Pull the latest TRIP image.

```bash
docker pull ghcr.io/itskovacs/trip:1
```

Create a file named `Dockerfile` in your TRIP directory to copy your CA certificate in a custom TRIP image.

```
# Use latest TRIP image
FROM ghcr.io/itskovacs/trip:1

# Copy your CA certificate file in the image. Replace myCA.crt with your certificate name.
COPY myCA.crt /usr/local/share/ca-certificates/
RUN update-ca-certificates
```

Then, simply build the image:

```bash
docker build -t trip-custom-cert .
```

When you want to run TRIP, you just have to use your newly created image `trip-custom-cert`:

```bash
docker run -p 8080:8000 -v ./storage:/app/storage trip-custom-cert
```

:::note
On TRIP update, simply re-create your custom image:

```
docker pull ghcr.io/itskovacs/trip:1
docker build -t trip-custom-cert .
```

:::
