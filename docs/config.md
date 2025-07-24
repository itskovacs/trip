
You can modify the configuration by setting values in the `storage/config.yml` file.

> [!NOTE]
> After a `config.yml` edit, you must restart the container for the changes to take effect.


### Change Token duration

To modify the token lifespan, edit `ACCESS_TOKEN_EXPIRE_MINUTES` for the *Access Token* and `REFRESH_TOKEN_EXPIRE_MINUTES` for the *Refresh Token*.
By default, the *Refresh Token* expires after `1440` minutes (24 hours), and the *Access Token* after `30` minutes.

```yaml
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_MINUTES=1440
```


### Configure OIDC Auth

```yaml
OIDC_DISCOVERY_URL="https://sso.yourdomain.lan/.well-known/openid-configuration"
OIDC_CLIENT_ID="your-client-id"
OIDC_CLIENT_SECRET="your-client-secret"
OIDC_REDIRECT_URI="https://trip.yourdomain.lan/auth"
```

> [!CAUTION]
> You might face a `SSLError` / `CERTIFICATE_VERIFY_FAILED`. I invite you to check [Troubleshoot SSL Error](#tbshoot-cert) section


### Disable registration

The key `REGISTER_ENABLE` can be configured to `false` if you want to disable registration.

**To disable**, add this in your `config.yml`:
```yaml
REGISTER_ENABLE=false
```

### Modify Image default size

By default, images are resized to `500px` for places and `600px` for trips. You can override these default values by setting them in the `config.yml`:

> [!CAUTION]
> Higher numbers will lead to higher disk usage.

```yaml
PLACE_IMAGE_SIZE=500
TRIP_IMAGE_SIZE=600
```

### Troubleshoot SSL Error / Certificate <a name = "tbshoot-cert"></a>

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

> [!IMPORTANT]
> On TRIP update, simply re-create your custom image:
> ```
> docker pull ghcr.io/itskovacs/trip:1
> docker build -t trip-custom-cert .
> ```