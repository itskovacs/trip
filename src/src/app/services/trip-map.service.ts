import { Injectable, inject, signal } from '@angular/core';
import * as L from 'leaflet';
import { TranslocoService } from '@jsverse/transloco';
import { UtilsService } from './utils.service';
import {
  createMap,
  createClusterGroup,
  placeToMarker,
  tripDayMarker,
  gpxToPolyline,
  toDotMarker,
  getGeolocationLatLng,
  ContextMenuItem,
} from '../shared/map';
import { DayViewModel, HighlightData, TripItem, ViewTripItem } from '../types/trip';
import { Place } from '../types/poi';

const MAX_MAP_INIT_RETRIES = 5;

export interface InitMapOptions {
  contextMenuItems: ContextMenuItem[];
  tileLayer?: string;
  center?: L.LatLngTuple;
  onMissingContainer?: () => void;
  onCreated?: () => void;
}

@Injectable()
export class TripMapService {
  private utilsService = inject(UtilsService);
  private translocoService = inject(TranslocoService);

  map?: L.Map;
  mapReady = signal(false);
  markerClusterGroup?: L.MarkerClusterGroup;
  tripMapAntLayer?: L.FeatureGroup;
  markers = new Map<number, L.Marker>();
  selectedItemMarker?: L.Marker;
  highlightedMarkerElement?: HTMLElement;
  gpxLayerGroup?: L.LayerGroup;
  displayedItemGpxId = signal<number | null>(null);
  collapsedDayIds = signal<Set<number>>(new Set());

  private mapInitRetries = 0;

  initMap(options: InitMapOptions): void {
    if (!document.getElementById('map')) {
      if (this.mapInitRetries < MAX_MAP_INIT_RETRIES) {
        this.mapInitRetries++;
        setTimeout(() => this.initMap(options), 100 + this.mapInitRetries * 100);
      } else {
        options.onMissingContainer?.();
      }
      return;
    }
    this.mapInitRetries = 0;

    this.cleanupMap();
    this.map = createMap(options.contextMenuItems, options.tileLayer, () => this.mapReady.set(true));
    this.markerClusterGroup = createClusterGroup().addTo(this.map);
    if (options.center) this.map.setView(options.center);
    options.onCreated?.();
  }

  cleanupMap(): void {
    if (this.tripMapAntLayer) {
      this.map?.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayer = undefined;
    }

    if (this.gpxLayerGroup) {
      this.map?.removeLayer(this.gpxLayerGroup);
      this.gpxLayerGroup = undefined;
    }
    this.displayedItemGpxId.set(null);

    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();

    if (this.markerClusterGroup) {
      this.markerClusterGroup.clearLayers();
      this.markerClusterGroup = undefined;
    }

    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
    this.mapReady.set(false);
  }

  updateMapVisualization(
    viewModels: DayViewModel[],
    places: Place[],
    usedPlaceIds: Set<number>,
    onPlaceClick: (place: Place, itemsUsingPlace: ViewTripItem[]) => void,
    onPlaceRightClick?: (place: Place) => void,
  ): void {
    if (!this.map || !this.markerClusterGroup) return;

    this.markerClusterGroup.clearLayers();
    this.markers.clear();

    if (this.tripMapAntLayer) {
      this.map.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayer = undefined;
    }

    const markersToAdd: L.Marker[] = [];

    const itemsByPlaceId = new Map<number, ViewTripItem[]>();
    viewModels.forEach((vm) => {
      vm.items.forEach((item) => {
        if (item.place?.id) {
          if (!itemsByPlaceId.has(item.place.id)) {
            itemsByPlaceId.set(item.place.id, []);
          }
          itemsByPlaceId.get(item.place.id)!.push(item);
        }
      });
    });

    places.forEach((place) => {
      const isUsed = usedPlaceIds.has(place.id);
      const marker = placeToMarker(
        place,
        false,
        !isUsed,
        false,
        onPlaceRightClick ? () => onPlaceRightClick(place) : null,
      );
      marker.on('add', (e: any) => {
        const el = e.target.getElement();
        if (el && e.target.isHighlightedPlace) el.classList.add('active-trip-place');
      });

      const itemsUsingPlace = itemsByPlaceId.get(place.id) || [];
      marker.on('click', () => onPlaceClick(place, itemsUsingPlace));

      this.markers.set(place.id, marker);
      markersToAdd.push(marker);
    });

    if (markersToAdd.length) {
      this.markerClusterGroup.addLayers(markersToAdd);
    }
  }

  resetMapBounds(places: Place[], viewModels: DayViewModel[]): void {
    if (!places.length) {
      if (!viewModels.length) return;

      const itemsWithCoordinates = viewModels
        .flatMap((dayVM) => dayVM.items)
        .filter((i) => i.lat != null && i.lng != null);

      if (!itemsWithCoordinates.length) return;
      this.map?.fitBounds(
        itemsWithCoordinates.map((i) => [i.lat!, i.lng!]),
        { padding: [15, 15] },
      );
      return;
    }

    this.map?.fitBounds(
      places.map((p) => [p.lat, p.lng]),
      { padding: [15, 15] },
    );
  }

  applyHighlight(data: HighlightData | null, onItemClick: (item: TripItem) => void): void {
    const activePlaceIds = data?.activePlaceIds || new Set<number>();
    this.markers.forEach((marker: any, placeId) => {
      const isHighlighted = activePlaceIds.has(placeId);
      marker.isHighlightedPlace = isHighlighted;
      const el = marker.getElement();
      if (!el) return;

      if (isHighlighted) el.classList.add('active-trip-place');
      else el.classList.remove('active-trip-place');
    });

    if (this.tripMapAntLayer) {
      this.map?.removeLayer(this.tripMapAntLayer);
      this.tripMapAntLayer = undefined;
    }

    const mapContainer = this.map?.getContainer();
    if (!data || !this.map) {
      if (mapContainer) mapContainer.classList.remove('leaflet-tripday-pane-highlighting');
      return;
    }

    if (mapContainer) mapContainer.classList.add('leaflet-tripday-pane-highlighting');

    const layerGroup = L.featureGroup();
    data.paths.forEach((p) => {
      const polyline = L.polyline(p.coords, {
        color: p.options.color,
        weight: p.options.weight,
        className: 'animated-path',
        smoothFactor: 1.5,
      });
      layerGroup.addLayer(polyline);
    });
    data.markers.forEach((item) => {
      const marker = tripDayMarker(item);
      marker.on('add', (e: any) => e.target.getElement()?.classList.add('active-trip-marker'));
      marker.on('click', () => onItemClick(item));
      layerGroup.addLayer(marker);
    });
    data.gpxData.forEach((gpx) => layerGroup.addLayer(gpxToPolyline(gpx)));

    this.tripMapAntLayer = layerGroup;
    requestAnimationFrame(() => {
      if (this.tripMapAntLayer && this.map) {
        this.tripMapAntLayer.addTo(this.map);
        this.map.fitBounds(data.bounds, { padding: [30, 30], maxZoom: 16 });
      }
    });
  }

  showSelection(place: Place | null, item: ViewTripItem | null): void {
    this.clearSelectedItemHighlight();
    this.clearItemGPX();
    if (!this.map) return;
    if (place) {
      const existingMarker = this.markers.get(place.id);
      if (existingMarker) this.highlightExistingMarker(existingMarker);
      return;
    } else if (item) {
      const lat = item.lat;
      const lng = item.lng;
      if (lat && lng) {
        this.selectedItemMarker = tripDayMarker(item);
        this.selectedItemMarker.addTo(this.map);
      }
    }
  }

  onRowEnter(item: ViewTripItem): void {
    this.clearSelectedItemHighlight();
    const placeId = item?.place?.id;
    if (!placeId) return;

    const marker = this.markers.get(placeId);
    if (marker) this.highlightExistingMarker(marker);
  }

  onRowLeave(): void {
    this.clearSelectedItemHighlight();
  }

  highlightExistingMarker(marker: L.Marker): void {
    if (!this.markerClusterGroup) return;
    const markerElement = marker.getElement() as HTMLElement;
    if (markerElement) {
      markerElement.classList.add('list-hover');
      this.highlightedMarkerElement = markerElement;
    } else {
      const parentCluster = (this.markerClusterGroup as any).getVisibleParent(marker);
      if (parentCluster) {
        const clusterEl = parentCluster.getElement();
        if (clusterEl) {
          clusterEl.classList.add('list-hover');
          this.highlightedMarkerElement = clusterEl;
        }
      }
    }
  }

  clearSelectedItemHighlight(): void {
    if (this.selectedItemMarker) {
      this.map?.removeLayer(this.selectedItemMarker);
      this.selectedItemMarker = undefined;
    }

    if (this.highlightedMarkerElement) {
      this.highlightedMarkerElement.classList.remove('list-hover');
      this.highlightedMarkerElement = undefined;
    }
  }

  toggleItemGPX(item: ViewTripItem): void {
    if (!this.map || !item.gpx) return;

    if (this.displayedItemGpxId() === item.id) {
      this.clearItemGPX();
      return;
    }

    if (!this.gpxLayerGroup) this.gpxLayerGroup = L.layerGroup().addTo(this.map);
    this.gpxLayerGroup.clearLayers();

    try {
      const polyline = gpxToPolyline(item.gpx);
      this.gpxLayerGroup.addLayer(polyline);
      this.map.fitBounds(polyline.getBounds(), { padding: [20, 20] });
      this.displayedItemGpxId.set(item.id);
    } catch {
      this.utilsService.toast(
        'error',
        this.translocoService.translate('common.status.error'),
        this.translocoService.translate('messages.could_not_parse_gpx'),
      );
    }
  }

  clearItemGPX(): void {
    this.gpxLayerGroup?.clearLayers();
    this.displayedItemGpxId.set(null);
  }

  toggleDayCollapse(dayId: number, event: Event): void {
    event.stopPropagation();
    this.collapsedDayIds.update((ids) => {
      const newIds = new Set(ids);
      if (newIds.has(dayId)) newIds.delete(dayId);
      else newIds.add(dayId);
      return newIds;
    });
  }

  toggleAllDaysCollapse(dayIds: number[]): void {
    const anyCollapsed = dayIds.some((id) => this.collapsedDayIds().has(id));
    this.collapsedDayIds.set(anyCollapsed ? new Set() : new Set(dayIds));
  }

  async centerOnMe(): Promise<void> {
    const position = await getGeolocationLatLng();
    if (position.err) {
      this.utilsService.toast('error', this.translocoService.translate('common.status.error'), position.err);
      return;
    }

    const coords: L.LatLngTuple = [position.lat!, position.lng!];
    this.map?.flyTo(coords);
    const marker = toDotMarker(coords);
    marker.addTo(this.map!);
    setTimeout(() => {
      marker.remove();
    }, 4000);
  }
}
