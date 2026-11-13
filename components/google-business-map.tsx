"use client";
import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { PublicBusiness } from "@/lib/server/public-directory";

type Point = { lat: number; lng: number };
type MapHandle = { setCenter: (point: Point) => void };
type MapsApi = { Map: new (element: HTMLElement, options: { center: Point; zoom: number; mapTypeControl: boolean }) => MapHandle; Marker: new (options: { map: MapHandle; position: Point; title: string }) => unknown };
type MapsWindow = Window & { google?: { maps?: MapsApi }; radarMapsReady?: () => void };
const key = process.env.NEXT_PUBLIC_RADAR_MAPS_KEY;
let loader: Promise<MapsApi> | null = null;

function loadMaps(): Promise<MapsApi> {
  if (!key) return Promise.reject(new Error("Google Maps sin configurar"));
  const browser = window as MapsWindow;
  if (browser.google?.maps) return Promise.resolve(browser.google.maps);
  if (!loader) loader = new Promise<MapsApi>((resolve, reject) => {
    const script = document.createElement("script");
    browser.radarMapsReady = () => { if (browser.google?.maps) resolve(browser.google.maps); else reject(new Error("Google Maps no respondió")); delete browser.radarMapsReady; };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=radarMapsReady&language=es&region=MX`;
    script.async = true;
    script.onerror = () => { loader = null; delete browser.radarMapsReady; reject(new Error("No se pudo cargar Google Maps")); };
    document.head.appendChild(script);
  });
  return loader;
}

export default function GoogleBusinessMap({ businesses }: { businesses: PublicBusiness[] }) {
  const surface = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(key ? "loading" : "unavailable");
  useEffect(() => {
    if (!key || !surface.current || !businesses.length) return;
    let active = true;
    void loadMaps().then(maps => {
      if (!active || !surface.current) return;
      const first = businesses[0];
      const map = new maps.Map(surface.current, { center: { lat: first.latitude!, lng: first.longitude! }, zoom: 12, mapTypeControl: false });
      for (const business of businesses) if (business.latitude !== null && business.longitude !== null) new maps.Marker({ map, position: { lat: business.latitude, lng: business.longitude }, title: business.name });
      setStatus("ready");
    }).catch(() => { if (active) setStatus("unavailable"); });
    return () => { active = false; };
  }, [businesses]);
  return <div className="map-canvas google-map"><div className="google-map-surface" ref={surface} aria-label="Mapa de ubicaciones verificadas" />{status !== "ready" && <div className="map-state" role="status"><MapPin />{status === "loading" ? "Cargando ubicaciones verificadas…" : "Mapa interactivo no configurado. Usa la dirección y el enlace de cada negocio."}</div>}</div>;
}
