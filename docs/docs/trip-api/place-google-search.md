---
sidebar_position: 3
description: Creating a place using the TRIP API and Google API
---

# Places - Creation using Google

:::warning
You must have your [TRIP API Key](generating-api-key) and your account should have a [Google API Key](/docs/map-tracker/settings#account) set to continue.
:::

You can create a place resolved by Google using the URL `/api/by_token/google-search` and the method `POST`.  
Your TRIP API Key must be set in the headers: `X-Api-Token: <key>`.

| Method |              URL              |        Header        |   Body    |
| :----: | :---------------------------: | :------------------: | :-------: |
| `POST` | `/api/by_token/google-search` | `X-Api-Token: <key>` | `{ ... }` |

You have three resolve options:

1. By _name_ (e.g. `British Museum`)
2. By place link (e.g. `https://www.google.com/maps/place/British+Museum/@51.5194166,-0.1295...0vMDFoYjM`)
3. By Short link (e.g. `https://maps.app.goo.gl/6smTQYq2CmHB5pMN7`)

:::info[format]
The body of your request is always the same:

```json
{
  "q": "..."
}
```

**Optionally**, you can specify a category. If Google Maps types mapping to category is not possible and no _category_ is provided, the _place_ will not be created (missing category).  
If a category is mapped by Google Maps, it takes precedence over the category specified in the key.

```json
{
  "q": "...",
  "category": "Culture"
}
```

:::

### By Name

```json
{
  "q": "British Museum",
  "category": "Culture"
}
```

### By place Link

```json
{
  "q": "https://www.google.com/maps/place/British+Museum/@51.5194166,-0.1295315,17z/data=!3m1!4b1!4m6!3m5!1s0x48761b323093d307:0x2fb199016d5642a7!8m2!3d51.5194133!4d-0.1269566!16zL20vMDFoYjM",
  "category": "Culture"
}
```

### By Short Link

```json
{
  "q": "https://maps.app.goo.gl/6smTQYq2CmHB5pMN7",
  "category": "Culture"
}
```
