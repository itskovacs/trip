import * as L from "leaflet";
import "leaflet.markercluster";
import "leaflet-contextmenu";
import { Place } from "../types/poi";
import { TripItem } from "../types/trip";

export interface ContextMenuItem {
  text: string;
  index?: number;
  icon?: string;
  callback?: any;
}
export interface MapOptions extends L.MapOptions {
  contextmenu: boolean;
  contextmenuItems: ContextMenuItem[];
}
export interface MarkerOptions extends L.MarkerOptions {
  contextmenu: boolean;
  contextmenuItems: ContextMenuItem[];
}

export function createMap(contextMenuItems?: ContextMenuItem[]): L.Map {
  let southWest = L.latLng(-89.99, -180);
  let northEast = L.latLng(89.99, 180);
  let bounds = L.latLngBounds(southWest, northEast);

  let _contextMenuItems = contextMenuItems || [];
  let map = L.map("map", {
    maxBoundsViscosity: 1.0,
    zoomControl: false,
    contextmenu: true,
    contextmenuItems: _contextMenuItems,
  } as MapOptions)
    .setZoom(10)
    .setMaxBounds(bounds);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    {
      maxZoom: 17,
      minZoom: 5,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  ).addTo(map);

  return map;
}

export function placeHoverTooltip(place: Place): string {
  let content = `<div class="font-semibold mb-1 truncate" style="font-size:1.1em">${place.name}</div>`;
  content += `<div><span class="bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded">${place.category.name}</span></div>`;
  return content;
}

export function createClusterGroup(): L.MarkerClusterGroup {
  return L.markerClusterGroup({
    chunkedLoading: true,
    disableClusteringAtZoom: 11,
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div class="custom-cluster">${count}</div>`,
        className: "",
        iconSize: [40, 40],
      });
    },
  });
}

export function tripDayMarker(item: {
  text: string;
  lat: number;
  lng: number;
}): L.Marker {
  const marker = new L.Marker([item.lat!, item.lng], {
    icon: L.divIcon({
      className: "bg-black rounded-full",
      iconSize: [14, 14],
    }),
  });

  let touchDevice = "ontouchstart" in window;
  if (!touchDevice) {
    marker.bindTooltip(
      `<div class="font-semibold mb-1 truncate text-base">${item.text}</div>`,
      {
        direction: "right",
        offset: [10, 0],
        className: "class-tooltip",
      },
    );
  }
  return marker;
}

export function placeToMarker(
  place: Place,
  isLowNet: boolean = true,
): L.Marker {
  let marker: L.Marker;
  let options: any = {
    riseOnHover: true,
    title: place.name,
    place_id: place.id,
    alt: "",
  };

  marker = new L.Marker([+place.lat, +place.lng], options);

  const markerImage = isLowNet
    ? place.category.image
    : (place.image ?? place.category.image);

  marker.options.icon = L.icon({
    iconUrl: markerImage,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    shadowSize: [0, 0],
    shadowAnchor: [0, 0],
    popupAnchor: [0, -12],
    className: place.visited ? "image-marker visited" : "image-marker",
  });

  let touchDevice = "ontouchstart" in window;
  if (!touchDevice) {
    marker.bindTooltip(placeHoverTooltip(place), {
      direction: "right",
      offset: [24, 0],
      className: "class-tooltip",
    });
  }
  return marker;
}

export function gpxToPolyline(gpx: string): L.Polyline {
  const parser = new DOMParser();
  const gpxDoc = parser.parseFromString(gpx, "application/xml");

  const trkpts = Array.from(gpxDoc.querySelectorAll("trkpt"));
  const latlngs = trkpts.map((pt) => {
    return [
      parseFloat(pt.getAttribute("lat")!),
      parseFloat(pt.getAttribute("lon")!),
    ] as [number, number];
  });

  return L.polyline(latlngs, { color: "blue" });
}
