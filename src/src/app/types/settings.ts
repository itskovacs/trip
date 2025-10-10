import { Category, Place } from './poi';

export interface Settings {
  username: string;
  map_lat: number;
  map_lng: number;
  currency: string;
  do_not_display: string[];
  tile_layer?: string;
  mode_low_network?: boolean;
  mode_dark?: boolean;
  mode_gpx_in_place?: boolean;
}

export interface ImportResponse {
  places: Place[];
  categories: Category[];
  settings: Settings;
}
