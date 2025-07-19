import * as L from "leaflet";
import "leaflet.markercluster";
import "leaflet-contextmenu";
import { Place } from "../types/poi";

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

export function assetHoverTooltip(place: Place): string {
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

export function placeToMarker(place: Place): L.Marker {
  let marker: L.Marker;
  let options: any = {
    riseOnHover: true,
    title: place.name,
    place_id: place.id,
    alt: "",
  };

  marker = new L.Marker([+place.lat, +place.lng], options);
  marker.options.icon = L.icon({
    iconUrl: place.image!,
    iconSize: [56, 56],
    iconAnchor: [28, 28],
    shadowSize: [0, 0],
    shadowAnchor: [0, 0],
    popupAnchor: [0, -12],
    className: "image-marker",
  });

  let touchDevice = "ontouchstart" in window;
  if (!touchDevice) {
    marker.bindTooltip(assetHoverTooltip(place), {
      direction: "right",
      offset: [24, 0],
      className: "class-tooltip",
    });
  }
  return marker;
}
