import re
import xml.etree.ElementTree as ET


def parse_mymaps_kml(kml_content: str):
    root = ET.fromstring(kml_content)
    ns = {"kml": "http://www.opengis.net/kml/2.2"}
    results = []
    for placemark in root.findall(".//kml:Placemark", ns):
        name_elem = placemark.find("kml:name", ns)
        if name_elem is None or not name_elem.text:
            continue

        name = name_elem.text
        point_elem = placemark.find(".//kml:Point/kml:coordinates", ns)
        if point_elem is not None and point_elem.text:
            coords_text = point_elem.text.strip()
            lng, lat = coords_text.split(",")[:2]
            results.append({"name": name, "lat": lat, "lng": lng})
        else:
            description_elem = placemark.find("kml:description", ns)
            if description_elem is not None and description_elem.text:
                url_match = re.search(r'https://[^\s<>"]+', description_elem.text)
                if url_match:
                    results.append({"name": name, "url": url_match.group(0)})

    return results
