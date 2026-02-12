export type RoutingProfile = 'car' | 'foot';

export interface ProviderPlaceResult {
  name: string;
  place: string;
  category?: string;
  lat: number;
  lng: number;
  price?: number;
  types: string[];
  allowdog?: boolean;
  description: string;
  image: string;
  restroom?: boolean;
}

export interface OSMRoutingResponse {
  distance: number;
  duration: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface OSMRoutingQuery {
  coordinates: { lat: number; lng: number }[];
  profile: RoutingProfile;
}

export interface RouteData {
  id: string;
  distance: number;
  duration: number;
  geometry: any;
  profile: RoutingProfile;
  layer: L.LayerGroup;
  color: string;
}

export interface RouteStyle {
  color: string;
  icon: string;
}
