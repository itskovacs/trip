export interface Category {
  id: number;
  name: string;
  image_id: number;
  image: string;
  color?: string;
}

export interface Place {
  id: number;
  name: string;
  lat: number;
  lng: number;
  place: string;
  category: Category;
  category_id?: number;

  user?: string;
  gpx?: string;
  image?: string;
  image_id?: number;
  price?: number;
  description?: string;
  duration?: number;
  allowdog?: boolean;
  visited?: boolean;
  favorite?: boolean;
  restroom?: boolean;
}

export interface ProviderBoundaries {
  northeast: { lat: number; lng: number };
  southwest: { lat: number; lng: number };
}
