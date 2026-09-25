"use client";

import {useEffect,useRef,useState} from "react";
import {MapPin} from "lucide-react";
import {categories,type Business} from "@/lib/radar-data";

export type MapPoint={lat:number;lng:number};
type PlaceMatch={location:MapPoint;title:string};

const apiKey=process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const center={lat:28.633,lng:-106.069};
let loader:Promise<any>|null=null;
const placeCache=new Map<string,PlaceMatch|null>();
const placeRequests=new Map<string,Promise<PlaceMatch|null>>();

function loadGoogleMaps():Promise<any>{
  if(!apiKey)return Promise.reject(new Error("Falta la clave de Google Maps"));
  if((window as any).google?.maps?.importLibrary)return Promise.resolve((window as any).google.maps);
  if(!loader)loader=new Promise((resolve,reject)=>{
    const callback="__radarLocalMapsReady";
    const script=document.createElement("script");
    (window as any)[callback]=()=>{delete (window as any)[callback];resolve((window as any).google.maps)};
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${callback}&language=es&region=MX`;
    script.async=true;
    script.onerror=()=>{delete (window as any)[callback];loader=null;reject(new Error("No se pudo cargar Google Maps"))};
    document.head.appendChild(script);
  });
  return loader;
}

async function findBusiness(maps:any,business:Business):Promise<PlaceMatch|null>{
  if(placeCache.has(business.id))return placeCache.get(business.id)!;
  const pending=placeRequests.get(business.id);
  if(pending)return pending;
  const request=(async()=>{
    const {Place}=await maps.importLibrary("places");
    const {places}=await Place.searchByText({textQuery:`${business.name}, Chihuahua, México`,fields:["displayName","location"],locationBias:center,region:"mx",language:"es",maxResultCount:1});
    const result=places?.[0];
    const match=result?.location?{location:{lat:result.location.lat(),lng:result.location.lng()},title:result.displayName||business.name}:null;
    placeCache.set(business.id,match);
    return match;
  })();
  placeRequests.set(business.id,request);
  try{return await request}finally{placeRequests.delete(business.id)}
}

export default function GoogleBusinessMap({business,listings,userLocation,onPlacesChange,onSelectBusiness}:{business:Business;listings?:Business[];userLocation?:MapPoint|null;onPlacesChange?:(places:Record<string,MapPoint>)=>void;onSelectBusiness?:(business:Business)=>void}){
  const surface=useRef<HTMLDivElement>(null);
  const mapRef=useRef<any>(null);
  const userMarkerRef=useRef<any>(null);
  const userLocationRef=useRef<MapPoint|null>(userLocation||null);
  const selectedRef=useRef(business.id);
  const [mapReady,setMapReady]=useState(false);
  const [status,setStatus]=useState<"loading"|"ready"|"not-found"|"error">("loading");

  useEffect(()=>{
    let active=true;
    async function initialize(){
      try{
        const maps=await loadGoogleMaps();
        const {Map}=await maps.importLibrary("maps");
        if(!active||!surface.current)return;
        mapRef.current=new Map(surface.current,{center,zoom:12,mapId:"DEMO_MAP_ID",mapTypeControl:false,streetViewControl:false,fullscreenControl:false});
        setMapReady(true);
      }catch(error){
        if(active){console.warn("Google Maps no está disponible",error);setStatus("error")}
      }
    }
    void initialize();
    return()=>{active=false;mapRef.current=null};
  },[]);

  const searchIdentity=listings?"all":business.id;
  useEffect(()=>{
    if(!mapReady||!mapRef.current)return;
    let active=true;
    const markers:any[]=[];
    setStatus("loading");
    async function showBusinesses(){
      try{
        const maps=(window as any).google.maps;
        const {AdvancedMarkerElement,PinElement}=await maps.importLibrary("marker");
        const targets=listings||[business];
        const found=await Promise.all(targets.map(async item=>{
          try{return {item,place:await findBusiness(maps,item)}}catch(error){console.warn(`No se encontró ${item.name} en Google Maps`,error);return {item,place:null}}
        }));
        if(!active||!mapRef.current)return;
        const locations:Record<string,MapPoint>={};
        for(const {item,place} of found){
          if(!place)continue;
          locations[item.id]=place.location;
          const color=categories.find(category=>category.id===item.categoryId)?.color||"#073b66";
          const marker=new AdvancedMarkerElement({map:mapRef.current,position:place.location,title:item.name,gmpClickable:true});
          marker.append(new PinElement({background:color,borderColor:"#fff",glyphColor:"#fff",glyphText:item.name[0]}));
          if(onSelectBusiness)marker.addEventListener("gmp-click",()=>onSelectBusiness(item));
          markers.push(marker);
        }
        onPlacesChange?.(locations);
        const focus=locations[selectedRef.current]||Object.values(locations)[0];
        if(userLocationRef.current){mapRef.current.panTo(userLocationRef.current);mapRef.current.setZoom(12)}
        else if(focus){mapRef.current.panTo(focus);mapRef.current.setZoom(14)}
        setStatus(Object.keys(locations).length?"ready":"not-found");
      }catch(error){
        if(active){console.warn("No se pudieron mostrar los negocios en Google Maps",error);setStatus("error")}
      }
    }
    void showBusinesses();
    return()=>{active=false;for(const marker of markers)marker.map=null};
  },[mapReady,listings,searchIdentity,onPlacesChange,onSelectBusiness]);

  useEffect(()=>{
    selectedRef.current=business.id;
    if(!mapRef.current)return;
    const place=placeCache.get(business.id);
    if(place){mapRef.current.panTo(place.location);mapRef.current.setZoom(14)}
  },[business.id]);

  useEffect(()=>{
    userLocationRef.current=userLocation||null;
    if(userMarkerRef.current){userMarkerRef.current.map=null;userMarkerRef.current=null}
    if(!mapReady||!userLocation||!mapRef.current)return;
    let active=true;
    async function showUser(){
      const maps=(window as any).google.maps;
      const {AdvancedMarkerElement,PinElement}=await maps.importLibrary("marker");
      if(!active||!mapRef.current)return;
      const marker=new AdvancedMarkerElement({map:mapRef.current,position:userLocation,title:"Tu ubicación",zIndex:100});
      marker.append(new PinElement({background:"#1a73e8",borderColor:"#fff",glyphColor:"#fff",glyphText:"T",scale:1.3}));
      userMarkerRef.current=marker;
      mapRef.current.panTo(userLocation);
      mapRef.current.setZoom(12);
    }
    void showUser();
    return()=>{active=false;if(userMarkerRef.current){userMarkerRef.current.map=null;userMarkerRef.current=null}};
  },[mapReady,userLocation]);

  return <div className="map-canvas google-map">
    <div className="google-map-surface" ref={surface} aria-label={`Mapa de Google para ${business.name}`}/>
    {status!=="ready"&&<div className={`map-state ${status==="loading"?"loading":""}`} role="status">
      {status==="loading"?"Buscando negocios en Google Maps…":status==="not-found"?"Google no encontró ubicaciones para estos perfiles.":<><MapPin/> No se pudo cargar Google Maps. Usa “Abrir en Google Maps”.</>}
    </div>}
    <span className="map-caption">Google Maps · Confirma la ubicación antes de visitar</span>
  </div>;
}
