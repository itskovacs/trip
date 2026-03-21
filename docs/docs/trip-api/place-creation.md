---
sidebar_position: 2
description: Creating a place using the TRIP API
---

# Places - Creation

:::warning
You must have your [TRIP API Key](generating-api-key).
:::

You can create a place using the URL `/api/by_token/place` and the method `POST`.  
Your TRIP API Key must be set in the headers: `X-Api-Token: <key>`.  
The body must contain the place.

| Method |          URL          |        Header        |   Body    |
| :----: | :-------------------: | :------------------: | :-------: |
| `POST` | `/api/by_token/place` | `X-Api-Token: <key>` | `{ ... }` |

:::warning[mandatory properties]

```
"category": "Category name" (case-sensitive)
"name": "The name"
"lat": 0.00
"lng": 0.00
"place": "Your string"
```

:::

:::note[optional properties]

```
"image": "https://example.com/image.jpg"
"allowdog": true/false
"description": "A description for the place"
"price": 0.00
"duration": 0
"favorite": true/false
"visited": true/false
"gpx": "gpx file content"
```

:::

Example:

```shell
$ curl -X POST https://trip.domain.lan/api/by_token/place \
-H "Content-Type: application/json" \
-H "X-Api-Token: <api_token>" \
-d '{"category": "...",..., "place": "..."}'
```
