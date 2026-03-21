---
sidebar_position: 3
description: Creating a place using the place creation modal
---

# Places - Creation

:::note[TL;DR]
Modal supports [flexible coordinate formats](places-creation#latitude-longitude-parser), [Google Maps place links](places-creation#google-place-parser), and [Provider API](places-creation#provider-api-autocompletion) autocomplete (API key required for Google Maps API).
:::

Creating a place is done through the place creation modal.

<img src="/trip/img/place_creation_modal.png" alt="Place creation modal" />
<div style={{textAlign: 'center'}}><sup>Place creation modal</sup></div>

A place contains the following informations:

- `name`: the place's name
- `latitude`: latitude coordinates ([supports multiple formats](places-creation#latitude-longitude-parser))
- `longitude`: longitude coordinates
- `place`: address or identifier ([supports GMaps place link](places-creation#google-place-parser))
- `category`: a label to categorize the places
- `image`: optional image to display in the map
- `duration`: optional duration in minutes (e.g., `90`)
- `price`: optional price
- `description`: optional description (links will be auto-clickable)
- `dog-friendly`: optional boolean indicating if dogs are allowed
- `toilets`: optional boolean indicating if dogs are allowed
- `visited`: status indicating if the place has been visited (controls default visibility)
- `gpx`: optional GPX file to display trace on the map

:::tip
You can script [places creation](/docs/trip-api/place-creation) and [import](places-import) various exports to automatically create them.
:::

### Provider API Autocompletion

The selected provider can be modified in your [settings](settings). If you use Google Maps, you must add your _Google API Key_ .

:::tip
You can use the shortcuts <kbd>Enter</kbd> to run the completion and <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to confirm the modal (if there is no missing field). Works for every modals.
:::

After entering a name, you can autocomplete the other fields by clicking the button inside the input area. Google is the most complete provider, providing opening hours, image and more.

<img src="/trip/img/place_provider_api.png" alt="Autocomplete using provider API" />
<div style={{textAlign: 'center'}}><sup>Autocomplete using provider API</sup></div>

### Google Place Parser

You can paste a Google Maps place link (*https://www.google.com/maps/place/XXX*) into the `place` input to automatically populate the `name`, `place`, `latitude` and `longitude` fields from the link content.

:::tip
If your selected provider is Google API and _Google API Key_ is set, you can also paste short link (*https://maps.app.goo.gl/XXX*) into the `place` input
:::

<img src="/trip/img/place_gmaps_parse.png" alt="Parse Google Maps place link" />
<div style={{textAlign: 'center'}}><sup>Parse Google Maps place link</sup></div>

### Latitude, Longitude Parser

The `latitude` field is flexible and supports multiple LatLng coordinate formats, like:

- `37.7749, -122.4194`
- `37.7749° N, 122.4194° W`
- `37°46'29.64" N, 122°25'9.84" W`
- `37°46.494' N, 122°25.164' W`

It also supports full\* [Plus Code](https://maps.google.com/pluscodes/) (e.g., `849VCWC8+R9`).

:::warning
Only full Plus Codes are currently handled. The `+` sign is added after eight characters for full codes (e.g., `849VCWC8+R9`) and after the four characters for short codes (e.g., not full: `V75V+9Q`).
:::
