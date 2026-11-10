/**
 * lib/ky911.js — download a Kentucky county's 911 address points.
 *
 * The Commonwealth publishes every county's 911 site/structure address points on its
 * GIS server (NG911 schema), public and without a key. lib/addressPoints.js matches
 * addresses against them. Bullitt County has about 28,000 points: 10 requests of 3,000.
 */
import fetch from "node-fetch";
import { USER_AGENT } from "./geocode.js";

const LAYER =
  "https://kygisserver.ky.gov/arcgis/rest/services/WGS84WM_Services/" +
  "Ky_911_Site_Structure_Address_Points_WGS84WM/MapServer/0/query";
const PAGE = 3000; // the layer's maxRecordCount

const FIELDS = {
  number: "Add_Number",
  preMod: "St_PreMod",
  preDir: "St_PreDir",
  preType: "St_PreTyp",
  name: "St_Name",
  postType: "St_PosTyp",
  postDir: "St_PosDir",
  town: "Post_Comm",
};

// county: as the layer writes it, e.g. "Bullitt County".
export async function fetchCountyAddressPoints(county) {
  const points = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({
      where: `County = '${county.replace(/'/g, "''")}'`,
      outFields: Object.values(FIELDS).join(","),
      orderByFields: "OBJECTID",
      resultOffset: String(offset),
      resultRecordCount: String(PAGE),
      outSR: "4326",
      f: "json",
    });
    const res = await fetch(`${LAYER}?${params}`, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new Error(`KY 911 address points: HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`KY 911 address points: ${json.error.message}`);
    for (const { attributes: a, geometry: g } of json.features ?? []) {
      const p = Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, a[f]]));
      points.push({ ...p, lon: g?.x, lat: g?.y });
    }
    if (!json.exceededTransferLimit) break;
  }
  return points;
}
