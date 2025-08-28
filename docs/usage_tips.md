## Settings
### Low Network Mode

*Low Network Mode* is enabled by default. When enabled, the app displays the Category image instead of the Place image to reduce network usage. You can disable this mode in the settings if you prefer to load Place images directly.


## Place Creation
### Google Maps URL Parsing

You can paste a link from Google Maps into the `place` input when creating a Place.

It will automatically fill the `Name`, `Place`, `Latitude` and `Longitude` from the link.

Try it yourself with this URL: `https://www.google.com/maps/place/British+Museum/@51.5194166,-0.1295315,17z/data=!3m1!4b1!4m6!3m5!1s0x48761b323093d307:0x2fb199016d5642a7!8m2!3d51.5194133!4d-0.1269566`.

To have this, you can either *click* on a Point of Interest in Google Maps or *search* for one, then copy the URL.


### Batch Creation
Places can be created using the Batch creation dialog, that supports JSON (array required).

Example:
```
[
{ "category": "Culture",  "name": "Car Museum", "lat": 12.12, "lng": 50.89, "place": "Auto History Museum" },
{ "category": "Nature & Outdoor",  "name": "An amazing park", "lat": 50.12, "lng": 12.89, "place": "The Park", "image": "https://upload.wikimedia.org/wikipedia/commons/b/be/Random_pyramids.jpg" }
]
```

> [!NOTE]
> Image links must include the file extension. URLs without it won't attach the image (the place is created, but no image).

> [!WARNING]
> Mandatory properties:
> ```
> "category": "Categoryn ame" (case-sensitive)
> "name": "The name"
> "lat": 0.00
> "lng": 0.00
> "place": "Your string"
> ```

> [!NOTE]
> Optional properties:
> ```
> "image": "https://example.com/image.jpg"
> "allowdog": true/false
> "description": "A description for the place"
> "price": 0.00
> "duration": 0
> "favorite": true/false
> "visited": true/false
> "gpx": "gpx file content"
> ```


### LatLng Parsing

You can paste a LatLng coordinate into the `latitude` input when creating a Place.

Supported formats include examples like:
- `37.7749, -122.4194`
- `37.7749° N, 122.4194° W`
- `37°46'29.64" N, 122°25'9.84" W`
- `37°46.494' N, 122°25.164' W`

### Plus Code Parsing

You can paste a [Plus Code](https://maps.google.com/pluscodes/) into the `latitude` input when creating a Place.

Example: `849VCWC8+R9`

> [!WARNING]
> Only full Plus Codes are currently handled. The `+` sign is added after eight characters for full codes and after the four characters for short codes.

## Trip

### Display a day itinerary

In addition to displaying the full trip itinerary using the button above the table, you can view the itinerary for a single day by clicking on that day's name in the table.  

This will show only the itinerary for the selected day.