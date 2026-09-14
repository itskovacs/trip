---
sidebar_position: 4
description: Authelia configuration example
---

# OIDC - Authelia

This page walks through both halves of the setup: registering TRIP as a client in Authelia, then pointing TRIP at it.

## 1. Register TRIP in Authelia

Add the client below to your Authelia configuration. The `claims_policy` matters here, TRIP reads `preferred_username` from the ID token, and Authelia only includes it if you ask for it explicitly.

```yaml title="configuration.yml"
identity_providers:
  oidc:
    claims_policies:
      claims_trip_policy:
        id_token:
          - preferred_username
    clients:
     -  client_id: '<REPLACE_ME>'
        client_name: 'Trip'
        client_secret: '<REPLACE_ME>'
        public: false
        authorization_policy: 'one_factor'
        claims_policy: 'claims_trip_policy'
        require_pkce: false
        redirect_uris:
          - 'https://trip.domain.tld/auth'
        scopes:
          - 'openid'
          - 'profile'
        response_types:
          - 'code'
        grant_types:
          - 'authorization_code'
        access_token_signed_response_alg: 'none'
        userinfo_signed_response_alg: 'none'
        token_endpoint_auth_method: 'client_secret_basic'
```


:::warning Secrets are stored hashed
Authelia expects a **hashed** `client_secret`, while TRIP needs the plaintext one. Generate a pair with:

```bash
authelia crypto hash generate pbkdf2 --variant sha512 --random --random.length 72
```

Put the digest in Authelia and keep the random string for the next step.
:::

A few values worth adjusting to your setup:

- **`client_id`**: any unique identifier you like, for example `trip`.
- **`authorization_policy`**: switch to `two_factor` if you want Authelia to enforce 2FA before granting access.
- **`redirect_uris`**: must be your TRIP URL followed by `/auth`, matched exactly, scheme and trailing path included.

Reload Authelia once the file is saved.

## 2. Configure TRIP

Set these variables in TRIP's environment, using the same client ID and the **plaintext** secret from above:

```ini title="config.env"
OIDC_CLIENT_ID="<SAME AS AUTHELIA CONFIG>"
OIDC_CLIENT_SECRET="<SECRET>"
OIDC_REDIRECT_URI="https://trip.domain.tld/auth"
OIDC_DISCOVERY_URL="https://auth.domain.tld/.well-known/openid-configuration"
```

The discovery URL lets TRIP fetch Authelia's endpoints automatically, so there's nothing else to wire up by hand.