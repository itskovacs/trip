export interface Category {
  id: number;
  name: string;
  image_id: number;
  image: string;
}

export interface Place {
  id: number;
  name: string;
  lat: number;
  lng: number;
  place: string;
  category: Category;
  category_id?: number;

  gpx?: string;
  image?: string;
  price?: number;
  description?: string;
  duration?: number;
  allowdog?: boolean;
  visited?: boolean;
  favorite?: boolean;
}
