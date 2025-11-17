import xml.etree.ElementTree as ET


def parse_mymaps_kml(kml_content: str):
    root = ET.fromstring(kml_content)
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    results = []
    for placemark in root.findall(".//kml:Placemark", ns):
        name_elem = placemark.find("kml:name", ns)

        if not (name := name_elem.text):
            continue

        point_elem = placemark.find("kml:Point/kml:coordinates", ns)
        if point_elem is None:
            continue

        coords_text = point_elem.text.strip()
        lng = coords_text.split(",")[0]
        lat = coords_text.split(",")[1]
        results.append({"name": name, "lat": lat, "lng": lng})

    return results
