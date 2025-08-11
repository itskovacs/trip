import { Place } from "./poi";

export interface TripBase {
  id: number;
  name: string;
  image?: string;
  archived?: boolean;
  user: string;
  days: number;
}

export interface Trip {
  id: number;
  name: string;
  image?: string;
  archived?: boolean;
  user: string;
  days: TripDay[];
  shared?: boolean;

  // POST / PUT
  places: Place[];
  place_ids: number[];
}

export interface TripDay {
  id: number;
  label: string;
  items: TripItem[];
}

export interface TripItem {
  id: number;
  time: string;
  text: string;
  comment?: string;
  place?: Place;
  lat?: number;
  lng?: number;
  price?: number;
  day_id: number;
  status?: string | TripStatus;
}

export interface TripStatus {
  label: string;
  color: string;
}

export interface FlattenedTripItem {
  td_id: number;
  td_label: string;
  id: number;
  time: string;
  text: string;
  comment?: string;
  place?: Place;
  price?: number;
  lat?: number;
  lng?: number;
  day_id: number;
  status?: TripStatus;
}

export interface SharedTripURL {
  url: string;
}
