import * as L from "leaflet";
import "leaflet.markercluster";
import "leaflet-contextmenu";
import { Place } from "../types/poi";

export const DEFAULT_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
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

export function createMap(
  contextMenuItems: ContextMenuItem[] = [],
  tilelayer: string = DEFAULT_TILE_URL,
): L.Map {
  const southWest = L.latLng(-89.99, -180);
  const northEast = L.latLng(89.99, 180);
  const bounds = L.latLngBounds(southWest, northEast);

  const map = L.map("map", {
    maxBoundsViscosity: 1.0,
    zoomControl: false,
    contextmenu: true,
    contextmenuItems: contextMenuItems,
  } as MapOptions)
    .setZoom(10)
    .setMaxBounds(bounds);

  L.tileLayer(tilelayer, {
    maxZoom: 17,
    minZoom: 3,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }).addTo(map);

  return map;
}

export function placeHoverTooltip(place: Place): string {
  return `<div class="font-semibold mb-1 truncate" style="font-size:1.1em">${place.name}</div><div><span style="color:${place.category.color}; background:${place.category.color}1A;" class="text-xs font-medium px-2.5 py-0.5 rounded">${place.category.name}</span></div>`.trim();
}

export function createClusterGroup(): L.MarkerClusterGroup {
  return L.markerClusterGroup({
    chunkedLoading: true,
    disableClusteringAtZoom: 11,
    showCoverageOnHover: false,
    maxClusterRadius: 50,
    iconCreateFunction: (cluster) => {
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
  time?: string;
}): L.Marker {
  const marker = new L.Marker([item.lat!, item.lng], {
    icon: L.divIcon({
      className: "bg-black rounded-full",
      iconSize: [14, 14],
    }),
  });

  const touchDevice = "ontouchstart" in window;
  if (!touchDevice) {
    marker.bindTooltip(
      `<div class="text-xs text-gray-500">${item.time}</div><div class="font-semibold mb-1 truncate text-base">${item.text}</div>`,
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
  grayscale: boolean = false,
  gpxInBubble: boolean = false,
): L.Marker {
  const options: Partial<L.MarkerOptions> = {
    riseOnHover: true,
    title: place.name,
    alt: "",
  };

  const markerImage = isLowNet
    ? place.category.image
    : (place.image ?? place.category.image);

  let markerClasses = "w-full h-full rounded-full bg-center bg-cover bg-white";
  if (grayscale) markerClasses += " grayscale";

  const iconHtml = `
    <div class="flex items-center justify-center relative rounded-full marker-anchor size-14 box-border" style="border: 2px solid ${place.category.color};">
      <div class="${markerClasses}" style="background-image: url('${markerImage}');"></div>
      ${gpxInBubble && place.gpx ? '<div class="absolute -top-1 -left-1 size-6 flex justify-center items-center bg-white border-2 border-black rounded-full"><i class="pi pi-compass"></i></div>' : ""}
    </div>
  `;

  const icon = L.divIcon({
    html: iconHtml.trim(),
    iconSize: [56, 56],
    className: "",
  });

  const marker = new L.Marker([+place.lat, +place.lng], {
    ...options,
    icon,
  });

  const touchDevice = "ontouchstart" in window;
  if (!touchDevice) {
    marker.bindTooltip(placeHoverTooltip(place), {
      direction: "right",
      offset: [28, 0],
      className: "class-tooltip",
    });
  }
  return marker;
}

export function gpxToPolyline(gpx: string): L.Polyline {
  const parser = new DOMParser();
  const gpxDoc = parser.parseFromString(gpx, "application/xml");

  const trkpts = Array.from(gpxDoc.querySelectorAll("trkpt"));
  const latlngs = trkpts.map(
    (pt) =>
      [
        parseFloat(pt.getAttribute("lat")!),
        parseFloat(pt.getAttribute("lon")!),
      ] as [number, number],
  );

  return L.polyline(latlngs, { color: "blue" });
}
