import { Place } from './poi';

export interface TripBase {
  id: number;
  name: string;
  image?: string;
  archived?: boolean;
  user: string;
  days: number;
  collaborators: TripMember[];
  currency: string;
}

export interface TripBaseWithDates extends TripBase {
  daterange?: Date[];
}

export interface Trip {
  id: number;
  name: string;
  image?: string;
  archived?: boolean;
  user: string;
  days: TripDay[];
  collaborators: TripMember[];
  currency: string;
  notes?: string;
  archival_review?: string;
  attachments?: TripAttachment[];

  // POST / PUT
  places: Place[];
  place_ids: number[];
  shared?: boolean;
}

export interface TripAttachment {
  id: number;
  filename: string;
  file_size: number;
  uploaded_by: string;
}

export interface TripDay {
  id: number;
  dt?: string;
  label: string;
  items: TripItem[];
  notes?: string;
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
  image?: string;
  image_id?: number;
  gpx?: string;
  paid_by?: string;
  attachments?: TripAttachment[];
}

export interface TripStatus {
  label: string;
  color: string;
}

export interface FlattenedTripItem {
  td_id: number;
  td_label: string;
  td_date?: string;
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
  distance?: number;
  image?: string;
  image_id?: number;
  gpx?: string;
  paid_by?: string;
  attachments?: TripAttachment[];
}

export interface TripMember {
  user: string;
  invited_by: string;
  invited_at: string;
  joined_at?: string;

  balance?: number; // Injected
}

export interface TripInvitation extends TripBase {
  invited_by: string;
  invited_at: string;
}

export interface SharedTripURL {
  url: string;
}

export interface PackingItem {
  id: number;
  text: string;
  category: string;
  qt?: number;
  packed?: boolean;
}

export interface ChecklistItem {
  id: number;
  text: string;
  checked?: boolean;
}

export interface PrintOptions {
  days: Set<number>;
  props: Set<string>;
  places: boolean;
  notes: boolean;
  metadata: boolean;
}
