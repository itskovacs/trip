import { Trip, TripDay, TripItem } from '../../types/trip';
import { saveBlobAs, tripFilename } from '../utils';

/*
 * Waypoint icons use Garmin symbol names (<sym>), understood by Garmin devices
 * and mapped to its own icon set by Locus Map.
 * Categories are user-defined, so we match on keywords (first match wins).
 */
const CATEGORY_SYMBOLS: [string, string][] = [
  ['parking', 'Parking Area'],
  ['food', 'Restaurant'],
  ['restaurant', 'Restaurant'],
  ['drink', 'Bar'],
  ['bar', 'Bar'],
  ['accommodation', 'Lodging'],
  ['hotel', 'Lodging'],
  ['camp', 'Campground'],
  ['culture', 'Museum'],
  ['museum', 'Museum'],
  ['church', 'Church'],
  ['view', 'Scenic Area'],
  ['beach', 'Beach'],
  ['water', 'Water Source'],
  ['forest', 'Forest'],
  ['nature', 'Park'],
  ['outdoor', 'Park'],
  ['park', 'Park'],
  ['hik', 'Trail Head'],
  ['adventure', 'Trail Head'],
  ['bike', 'Bike Trail'],
  ['ski', 'Skiing Area'],
  ['swim', 'Swimming Area'],
  ['sport', 'Fitness Center'],
  ['wellness', 'Fitness Center'],
  ['entertainment', 'Amusement Park'],
  ['leisure', 'Amusement Park'],
  ['festival', 'Live Theater'],
  ['event', 'Live Theater'],
  ['shop', 'Shopping Center'],
];
const DEFAULT_SYMBOL = 'Flag, Blue';

function categoryToGPXSymbol(category?: string): string {
  const name = (category ?? '').toLowerCase();
  return CATEGORY_SYMBOLS.find(([keyword]) => name.includes(keyword))?.[1] ?? DEFAULT_SYMBOL;
}

/** Exports the points of every day of the trip as GPX waypoints, one waypoint per plan */
export function generateTripGPXFile(trip: Trip): void {
  const waypoints = trip.days.flatMap((day) =>
    [...day.items]
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .map((item) => itemToWaypoint(day, item))
      .filter(Boolean),
  );

  const gpx = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="TRIP" xmlns="http://www.topografix.com/GPX/1/1">',
    ...waypoints,
    '</gpx>',
    '',
  ].join('\n');

  saveBlobAs(new Blob([gpx], { type: 'application/gpx+xml;charset=utf-8' }), tripFilename(trip.name, 'gpx'));
}

function itemToWaypoint(day: TripDay, item: TripItem): string {
  const place = item.place;
  const lat = item.lat ?? place?.lat;
  const lng = item.lng ?? place?.lng;
  if (lat == null || lng == null) return '';

  const pointName = item.text?.trim() || place?.name?.trim() || 'point';
  const description = [item.text, place?.name, place?.description].filter(Boolean).join('\n');

  return [
    `  <wpt lat="${lat}" lon="${lng}">`,
    `    <name>${xmlEscape(`${day.label}_${pointName}`)}</name>`,
    `    <cmt>${xmlEscape(item.comment ?? '')}</cmt>`,
    `    <desc>${xmlEscape(description)}</desc>`,
    `    <sym>${categoryToGPXSymbol(place?.category?.name)}</sym>`,
    `    <type>${xmlEscape(place?.category?.name ?? '')}</type>`,
    '  </wpt>',
  ].join('\n');
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
