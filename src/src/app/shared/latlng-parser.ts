const patternDEC = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const patternDD =
  /^\s*(\d{1,3}(?:\.\d+)?)°?\s*([NS])\s*,\s*(\d{1,3}(?:\.\d+)?)°?\s*([EW])\s*$/i;
const patternDMS =
  /^\s*(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([NS])\s*,\s*(\d{1,3})°\s*(\d{1,2})['′]\s*(\d{1,2}(?:\.\d+)?)["″]?\s*([EW])\s*$/i;
const patternDMM =
  /^\s*(\d{1,3})°\s*(\d{1,2}(?:\.\d+)?)['′]?\s*([NS])\s*,\s*(\d{1,3})°\s*(\d{1,2}(?:\.\d+)?)['′]?\s*([EW])\s*$/i;

function _dmsToDecimal(
  deg: number,
  min: number,
  sec: number,
  dir: string,
): number {
  let dec = deg + min / 60 + sec / 3600;
  return /[SW]/i.test(dir) ? -dec : dec;
}

function _dmmToDecimal(deg: number, min: number, dir: string): number {
  let dec = deg + min / 60;
  return /[SW]/i.test(dir) ? -dec : dec;
}

export function formatLatLng(num: number): string {
  const decimals = num.toString().split(".")[1]?.length || 0;
  return num.toFixed(Math.min(decimals, 5));
}

export function checkAndParseLatLng(
  value: string | number,
): [number, number] | undefined {
  if (value.constructor != String) {
    return;
  }

  // Parse DMS, DD, DDM to decimal [Lat, Lng]
  const dec = value.match(patternDEC);
  if (dec) {
    const lat = parseFloat(dec[1]);
    const lng = parseFloat(dec[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return [lat, lng];
    }
  }

  const dd = value.match(patternDD);
  if (dd) {
    let lat = parseFloat(dd[1]);
    let lng = parseFloat(dd[3]);
    lat *= /S/i.test(dd[2]) ? -1 : 1;
    lng *= /W/i.test(dd[4]) ? -1 : 1;
    return [lat, lng];
  }

  const dms = value.match(patternDMS);
  if (dms) {
    const lat = _dmsToDecimal(+dms[1], +dms[2], +dms[3], dms[4]);
    const lng = _dmsToDecimal(+dms[5], +dms[6], +dms[7], dms[8]);
    return [lat, lng];
  }

  const dmm = value.match(patternDMM);
  if (dmm) {
    const lat = _dmmToDecimal(+dmm[1], +dmm[2], dmm[3]);
    const lng = _dmmToDecimal(+dmm[4], +dmm[5], dmm[6]);
    return [lat, lng];
  }

  return undefined;
}
