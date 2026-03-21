---
sidebar_position: 4
description: Importing Google Maps POI to places
---

# Places - Import

:::note[TL;DR]
You can import _Google Takeout (Saved)_, _Google KMZ (MyMaps)_ or batch create (using plain text or google maps links)
:::

:::warning
A Google API Key is required. See [Setup Google Maps API Key](../misc/gmaps-api.md) for steps
:::

:::tip[JSON IMPORT]
To import places from a JSON file, you must script the import. See [TRIP Api - place creation](/docs/trip-api/place-creation)
:::

When migrating to TRIP, several import options are available:

- Import saved POI lists using _Google Takeout ([Saved](https://takeout.google.com/takeout/custom/saved))_
- Import MyMaps using _Google Takeout ([MyMaps](https://takeout.google.com/takeout/custom/mymaps))_
- Batch creation

<img src="/trip/img/place_import.png" alt="Place import options" />
<div style={{textAlign: 'center'}}><sup>Place import options</sup></div>

## Google Takeout - Saved

:::tip
In Google Takeout, select the option options called _Saved_, reference [https://takeout.google.com/takeout/custom/saved](https://takeout.google.com/takeout/custom/saved).
:::

Export your saved lists from Google as CSV files, then import them into TRIP to automatically add your places.

:::warning
Most fields are mapped and inferred automatically, but some categories will need manual assignment during import. This is a straightforward process.
:::

## Google Takeout - MyMaps KMZ

:::tip
In Google Takeout, select the option options called _MyMaps_, reference [https://takeout.google.com/takeout/custom/mymaps](https://takeout.google.com/takeout/custom/mymaps).
:::

Export your MyMaps maps into KMZ files, then import them into TRIP to automatically add your POIs.

:::warning
Most fields are mapped and inferred automatically, but some categories will need manual assignment during import. This is a straightforward process.
:::

## Batch Creation

To create multiple places, use the _batch creation_ feature, add content line by line.

It supports plain text

:::tip
If your selected provider is Google API and _Google API Key_ is set, it supports Google Maps place link (*https://www.google.com/maps/place/XXX*) and Google Maps short link (*https://maps.app.goo.gl/XXX*).
:::

<img src="/trip/img/place_import_batch.png" alt="Place import batch creation" />
<div style={{textAlign: 'center'}}><sup>Place import batch creation</sup></div>

:::warning
Most fields are mapped and inferred automatically, but some categories will need manual assignment during import. This is a straightforward process.
:::
