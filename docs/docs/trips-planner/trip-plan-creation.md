---
sidebar_position: 8
description: Create your first plan
---

# Trip - Plan creation

Creating a plan is done through the plan creation modal.

<img src="/trip/img/trip_plan_create.png" alt="Creating a plan in your trip" />
<div style={{textAlign: 'center'}}><sup>Plan creation modal</sup></div>

A plan has the following fields:

- `days`: day(s) for the plan
- `time`: `HH:MM` format time to sort plans within a day
- `text`: summary of the plan
- `place`: optional place (from referenced ones)
- `status`: optional label to tag the plan (_pending_, _booked_, _constraint_, _optional_)
- `latitude`: latitude coordinates (support multiple formats, see [Place - Creation](../map-tracker/places-creation#latitude-longitude-parser))
- `longitude`: longitude coordinates
- `price`: optional price
- `attachments`: optional files linked to the plan, based on the trip [attachments](trip-attachments-lists#attachments)
- `comment`: optional notes (links will be auto-clickable)
- `gpx`: optional GPX file to display trace on the map
- `image`: optional image for this plan

:::tip
Use the `status` field to mark _pending_ or _constraint_ or _booked_ plans to track your bookings and requirements. The [checklist](trip-attachments-lists#checklist) automatically references _pending_ and _constraint_ plans.
:::
