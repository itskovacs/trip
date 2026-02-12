import { Injectable, signal, computed } from '@angular/core';
import * as L from 'leaflet';
import { computeDistLatLng } from '../shared/utils';
import { RouteData, RouteStyle, RoutingProfile } from '../types/provider';

const HIGHLIGHT_COLORS = [
  '#e6194b',
  '#2c8638',
  '#4363d8',
  '#9a6324',
  '#b56024',
  '#911eb4',
  '#268383',
  '#cb2ac3',
  '#617f06',
  '#906e6e',
  '#008080',
  '#856e93',
  '#7a7a00',
];

@Injectable({
  providedIn: 'root',
})
export class RouteManagerService {
  routes = signal<Map<string, RouteData>>(new Map());
  availableColors = computed(() => {
    const usedColors = new Set(Array.from(this.routes().values()).map((route) => route.color));
    return HIGHLIGHT_COLORS.filter((color) => !usedColors.has(color));
  });

  profileIcons = {
    car: '🚗',
    foot: '🚶',
  };

  getProfile(from: L.LatLngTuple, to: L.LatLngTuple): RoutingProfile {
    const d = computeDistLatLng(from[0], from[1], to[0], to[1]);
    return d > 5 ? 'car' : 'foot';
  }

  addRoute(routeData: Omit<RouteData, 'layer' | 'color'>): L.LayerGroup {
    const { id, geometry, distance, duration, profile } = routeData;

    if (this.routes().has(id)) this.removeRoute(id);
    const availableColors = this.availableColors();
    let color: string;
    if (availableColors.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableColors.length);
      color = availableColors[randomIndex];
    } else {
      const randomIndex = Math.floor(Math.random() * HIGHLIGHT_COLORS.length);
      color = HIGHLIGHT_COLORS[randomIndex];
    }

    const icon = this.profileIcons[profile];
    const layer = this.createRouteLayer(geometry, distance, duration, { color, icon }, () => this.removeRoute(id));
    this.routes.update((routes) => {
      const newRoutes = new Map(routes);
      newRoutes.set(id, { ...routeData, layer, color });
      return newRoutes;
    });

    return layer;
  }

  removeRoute(id: string): void {
    const route = this.routes().get(id);
    if (!route) return;
    route.layer.remove();
    this.routes.update((routes) => {
      const newRoutes = new Map(routes);
      newRoutes.delete(id);
      return newRoutes;
    });
  }

  clearAll(): void {
    this.routes().forEach((route) => route.layer.remove());
    this.routes.set(new Map());
  }

  getRoute(id: string): RouteData | undefined {
    return this.routes().get(id);
  }

  createRouteLayer(
    geoJson: any,
    distance: number,
    duration: number,
    style: RouteStyle,
    onRemove: () => void,
  ): L.LayerGroup {
    const routeGroup = L.layerGroup();
    const polyline = L.geoJSON(geoJson, {
      style: {
        color: style.color,
        weight: 4,
        opacity: 0.7,
        className: 'route-line route-animate',
      },
    });
    polyline.addTo(routeGroup);

    // remove animation to prevent triggering si hover
    setTimeout(() => {
      polyline.eachLayer((layer) => {
        const path = (layer as L.Path).getElement();
        if (path) path.classList.remove('route-animate');
      });
    }, 2000);

    const badge = this.createRouteBadge(geoJson.coordinates, distance, duration, style, onRemove);
    badge.addTo(routeGroup);

    // highlight route si hover
    const highlightRoute = () => {
      polyline.bringToFront();
      polyline.setStyle({ weight: 8, opacity: 1.0 });
      badge.setZIndexOffset(1000);
    };

    const resetRoute = () => {
      polyline.setStyle({ weight: 4, opacity: 0.7 });
      badge.setZIndexOffset(0);
    };

    badge.on('mouseover', highlightRoute);
    polyline.on('mouseover', highlightRoute);
    badge.on('mouseout', resetRoute);
    polyline.on('mouseout', resetRoute);

    return routeGroup;
  }

  createRouteBadge(
    coordinates: number[][],
    distance: number,
    duration: number,
    style: RouteStyle,
    onRemove: () => void,
  ): L.Marker {
    const midIndex = Math.floor(coordinates.length / 2);
    const [lng, lat] = coordinates[midIndex];
    const midLatLng = L.latLng(lat, lng);

    const distanceText = this.formatDistance(distance);
    const durationText = this.formatDuration(duration);

    const badgeIcon = L.divIcon({
      className: 'routing-badge',
      html: `
        <div class="routing-badge-content" style="background: ${style.color}">
          <span>${style.icon} ${durationText} • ${distanceText}</span>
          <button class="routing-delete-btn" type="button"><i class="pi pi-times"></i></button>
        </div>
      `,
    });

    const marker = L.marker(midLatLng, {
      icon: badgeIcon,
      interactive: true,
      riseOnHover: true,
      zIndexOffset: 1001,
    });

    marker.on('add', () => {
      const element = marker.getElement();
      if (!element) return;

      const deleteBtn = element.querySelector<HTMLButtonElement>('.routing-delete-btn');
      if (!deleteBtn) return;
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        onRemove();
      };
    });

    return marker;
  }

  formatDistance(meters: number): string {
    const km = meters / 1000;
    return km >= 1 ? `${km.toFixed(1)} km` : `${meters.toFixed(0)} m`;
  }

  formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);

    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }

    return minutes > 0 ? `${minutes}m` : `${seconds}s`;
  }

  createRouteId(from: L.LatLngTuple, to: L.LatLngTuple, profile: string): string {
    return `${profile}_${from[0].toFixed(6)}-${from[1].toFixed(6)}_${to[0].toFixed(6)}-${to[1].toFixed(6)}`;
  }
}
