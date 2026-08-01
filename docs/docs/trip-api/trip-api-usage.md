---
sidebar_position: 2
description: Using the TRIP API
---

# Usage

:::warning
You must have your [TRIP API Key](generating-trip-api-key).
:::

Your TRIP API Key can be used in place of the normal `/login` flow to authenticate any request to the TRIP API. Set it as a header on your request: `X-Api-Token: <key>`

:::important
Admin routes do not accept the API Key, they require a regular login.
:::

Everything else (places, trips, categories, settings, bookings, etc.) is available, with the same permissions they'd have when logged in normally.

Create a place in your library:

```shell
$ curl -X POST https://trip.yourdomain.lan/api/places \
-H "Content-Type: application/json" \
-H "X-Api-Token: <api_token>" \
-d '{"category": "...", ...}'
```

List your trips:

```shell
$ curl https://trip.yourdomain.lan/api/trips \
-H "X-Api-Token: <api_token>"
```

For the full list of routes and their request/response bodies, browse the interactive API docs at `https://trip.yourdomain.lan/docs`.
