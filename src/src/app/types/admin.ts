export interface AdminUser {
  username: string;
  is_admin: boolean;
  quota_bytes: number;
  quota_places: number;
  totp_enabled: boolean;
  google_apikey: boolean;
  api_token: boolean;
}

export interface AppConfig {
  PLACE_IMAGE_SIZE: number;
  TRIP_IMAGE_SIZE: number;
  ATTACHMENT_MAX_SIZE: number;
  BACKUP_IMPORT_MAX_ENTRY_SIZE: number;
  BACKUP_IMPORT_MAX_TOTAL_SIZE: number;
  KML_MAX_ENTRY_SIZE: number;
  PROVIDER_IMPORT_MAX_SIZE: number;
  ACCESS_TOKEN_EXPIRE_MINUTES: number;
  REFRESH_TOKEN_EXPIRE_MINUTES: number;
  REGISTER_ENABLE: boolean;
  OIDC_DISCOVERY_URL: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  OIDC_REDIRECT_URI: string;
  DEFAULT_TILE: string;
  DEFAULT_CURRENCY: string;
  DEFAULT_MAP_LAT: number;
  DEFAULT_MAP_LNG: number;
}

// AppConfig fields stored as bytes on the backend but edited as MB in the admin UI.
export const APP_CONFIG_MB_FIELDS: (keyof AppConfig)[] = [
  'ATTACHMENT_MAX_SIZE',
  'BACKUP_IMPORT_MAX_ENTRY_SIZE',
  'BACKUP_IMPORT_MAX_TOTAL_SIZE',
  'KML_MAX_ENTRY_SIZE',
  'PROVIDER_IMPORT_MAX_SIZE',
];

export interface MagicLink {
  token: string;
  expires: string;
  url: string; // computed on service
}
