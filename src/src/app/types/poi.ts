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
  price?: number;
  description?: string;
  duration?: number;
  allowdog?: boolean;
  visited?: boolean;
  favorite?: boolean;
}

export interface GooglePlaceResult {
  name: string;
  place: string;
  category?: string;
  lat: number;
  lng: number;
  price: number;
  types: string[];
  allowdog: boolean;
  description: string;
  image: string;
}

export interface GoogleBoundaries {
  northeast: { lat: number; lng: number };
  southwest: { lat: number; lng: number };
}
