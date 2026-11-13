"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext dev currently optimizes next/link inconsistently on this isolated route. */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, BadgeCheck, Building2, CalendarDays, ChevronRight, FileText, Globe2, LayoutDashboard, LogOut, Megaphone, Menu, Settings2, Tags, Users, Wallet, X } from "lucide-react";
import { adminBenefitKeys, adminSettingKeys } from "@/lib/admin-catalog";

type Row = Record<string, unknown>;
type Data = Record<string, unknown>;
type Field = { key: string; label: string; kind?: "text" | "textarea" | "number" | "select" | "checkbox" | "datetime"; required?: boolean; options?: string[] | { value: string; label: string }[]; nullable?: boolean };
type Resource = { title: string; dataKey: string; action: string; fields: Field[]; display: string[]; create?: boolean };
type Section = "dashboard" | "users" | "businesses" | "reviews" | "categories" | "geography" | "plans" | "subscriptions" | "content" | "settings" | "advertising" | "legal" | "audit";

const PENDING = "PENDIENTE_CONFIGURACION";
const states = [PENDING, "PUBLICADO", "ARCHIVADO"];
const menu: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard }, { id: "users", label: "Usuarios y admins", icon: Users },
  { id: "businesses", label: "Negocios", icon: Building2 }, { id: "reviews", label: "Aprobaciones", icon: BadgeCheck },
  { id: "categories", label: "Categorías y filtros", icon: Tags }, { id: "geography", label: "Estados y ciudades", icon: Globe2 },
  { id: "plans", label: "Planes y beneficios", icon: Wallet }, { id: "subscriptions", label: "Suscripciones", icon: CalendarDays },
  { id: "content", label: "Promociones y eventos", icon: Megaphone }, { id: "settings", label: "Configuración", icon: Settings2 },
  { id: "advertising", label: "Publicidad y tarifas", icon: Megaphone }, { id: "legal", label: "Documentos legales", icon: FileText },
  { id: "audit", label: "Auditoría", icon: Activity },
];
const field = (key: string, label: string, extra: Partial<Field> = {}): Field => ({ key, label, ...extra });
const fStatus = field("status", "Estado", { kind: "select", options: states });
const fName = field("name", "Nombre", { required: true });
const fSlug = field("slug", "Identificador", { required: true });
const fPrice = field("priceMinor", "Precio en MXN (vacío si pendiente)", { kind: "number", nullable: true });
const fCurrency = field("currency", "Moneda", { kind: "select", options: ["", "MXN"], nullable: true });
const labels: Record<string, string> = {
  name: "Nombre", slug: "Identificador", status: "Estado", verification: "Verificación", suspendedAt: "Suspendido", priceMinor: "Precio (centavos)", currency: "Moneda", businessId: "Negocio", planId: "Plan", userId: "Usuario", startsAt: "Inicio", endsAt: "Fin", sourceUrl: "Fuente", rights: "Derechos", parentId: "Categoría principal", code: "Código", key: "Parámetro", value: "Valor", kind: "Tipo", version: "Versión", publishedAt: "Publicado", content: "Contenido",
  PENDIENTE_CONFIGURACION: "PENDIENTE_CONFIGURACION", PENDIENTE_VERIFICACION: "Pendiente de verificar", VERIFICADO: "Verificado", PENDIENTE: "Pendiente", ACTIVA: "Activa", SUSPENDIDA: "Suspendida", CANCELADA: "Cancelada", VENCIDA: "Vencida", PUBLICADO: "Publicado", ARCHIVADO: "Archivado", BORRADOR: "Borrador", EN_REVISION: "En revisión", RECHAZADO: "Rechazado", AUTORIZADO: "Autorizado", GRATUITO: "Gratuito", BASICO: "Básico", PLUS: "Plus",
  commercial_name: "Nombre comercial", description: "Descripción", logo_url: "URL del logo", hero_image_url: "Imagen institucional", social_facebook: "Facebook", social_instagram: "Instagram", social_tiktok: "TikTok", contact_url: "Enlace de contacto", profile_edit: "Edición ampliada", max_photos: "Máximo de fotografías", expanded_gallery: "Galería ampliada", promotions: "Promociones", events: "Eventos", statistics: "Estadísticas", featured_placement: "Posicionamiento destacado",
};
function display(value: unknown): string { const raw = textValue(value); return labels[raw] ?? short(value); }

function rows(data: Data, key: string): Row[] { const value = data[key]; return Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === "object") : []; }
function str(value: unknown): string { return value === null || value === undefined ? "" : typeof value === "object" ? JSON.stringify(value) : String(value); }
function textValue(value: unknown): string { return value && typeof value === "object" && "text" in value ? str((value as Row).text) : str(value); }
function short(value: unknown): string { const valueText = textValue(value); return valueText.length > 80 ? `${valueText.slice(0, 77)}…` : valueText || "—"; }
function optionsFrom(data: Data, key: string, labelKey = "name") { return [{ value: "", label: "Sin seleccionar" }, ...rows(data, key).filter(row => typeof row.id === "string").map(row => ({ value: str(row.id), label: str(row[labelKey] ?? row.code ?? row.id) }))]; }

function resources(section: Section, data: Data): Resource[] {
  switch (section) {
    case "categories": return [
      { title: "Categorías y subcategorías", dataKey: "categories", action: "category.save", create: true, display: ["name", "slug", "status"], fields: [fName, fSlug, field("parentId", "Categoría principal", { kind: "select", options: optionsFrom(data, "categories"), nullable: true }), fStatus] },
      { title: "Amenidades y filtros", dataKey: "amenities", action: "amenity.save", create: true, display: ["name", "slug", "status"], fields: [fName, fSlug, fStatus] },
    ];
    case "geography": return [
      { title: "Estados", dataKey: "states", action: "state.save", create: true, display: ["code", "name"], fields: [field("code", "Código", { required: true }), fName] },
      { title: "Ciudades", dataKey: "cities", action: "city.save", create: true, display: ["name", "slug", "stateId"], fields: [field("stateId", "Estado", { kind: "select", options: optionsFrom(data, "states"), required: true }), fName, fSlug] },
    ];
    case "plans": return [
      { title: "Planes", dataKey: "plans", action: "plan.save", create: true, display: ["code", "name", "priceMinor", "status"], fields: [field("code", "Plan", { kind: "select", options: ["GRATUITO", "BASICO", "PLUS"], required: true }), fName, fPrice, fCurrency, fStatus] },
      { title: "Beneficios", dataKey: "benefits", action: "benefit.save", create: true, display: ["planId", "key", "value", "status"], fields: [field("planId", "Plan", { kind: "select", options: optionsFrom(data, "plans"), required: true }), field("key", "Beneficio", { kind: "select", options: [...adminBenefitKeys], required: true }), field("value", "Valor (sí/no o cantidad)", { required: true })] },
    ];
    case "subscriptions": return [{ title: "Suscripciones", dataKey: "subscriptions", action: "subscription.save", create: true, display: ["businessId", "planId", "status", "endsAt"], fields: [field("businessId", "Negocio", { kind: "select", options: optionsFrom(data, "businesses"), required: true }), field("planId", "Plan", { kind: "select", options: optionsFrom(data, "plans"), required: true }), field("status", "Estado", { kind: "select", options: ["PENDIENTE", "ACTIVA", "SUSPENDIDA", "CANCELADA", "VENCIDA"] }), field("startsAt", "Desde", { kind: "datetime", nullable: true }), field("endsAt", "Hasta", { kind: "datetime", nullable: true })] }];
    case "settings": return [
      { title: "Datos institucionales", dataKey: "settings", action: "setting.save", create: true, display: ["key", "value", "status"], fields: [field("key", "Parámetro", { kind: "select", options: [...adminSettingKeys], required: true }), field("value", "Valor", { kind: "textarea", nullable: true }), fStatus] },
      { title: "Contacto", dataKey: "contacts", action: "contact.save", create: true, display: ["kind", "value", "status"], fields: [field("kind", "Canal", { kind: "select", options: ["EMAIL", "PHONE", "WHATSAPP", "FACEBOOK", "INSTAGRAM", "TIKTOK", "WEBSITE"] }), field("value", "Valor", { nullable: true }), fStatus] },
    ];
    case "advertising": return [
      { title: "Tarifas", dataKey: "rates", action: "rate.save", create: true, display: ["code", "priceMinor", "status"], fields: [field("code", "Código", { required: true }), fPrice, fCurrency, fStatus] },
      { title: "Anuncios", dataKey: "advertisements", action: "content.save", create: true, display: ["content", "status", "startsAt"], fields: contentFields(data, true) },
    ];
    case "legal": return [{ title: "Versiones legales", dataKey: "documents", action: "legal.save", create: true, display: ["kind", "version", "status", "publishedAt"], fields: [field("kind", "Documento", { kind: "select", options: ["TERMINOS", "PRIVACIDAD", "COOKIES", "OTRO"] }), field("body", "Contenido", { kind: "textarea", nullable: true }), fStatus] }];
    case "content": return [
      { title: "Promociones", dataKey: "promotions", action: "content.save", create: true, display: ["content", "status", "businessId"], fields: contentFields(data, false) },
      { title: "Eventos", dataKey: "events", action: "content.save", create: true, display: ["content", "status", "startsAt"], fields: contentFields(data, true) },
      { title: "Publicidad", dataKey: "advertisements", action: "content.save", create: true, display: ["content", "status", "startsAt"], fields: contentFields(data, true) },
    ];
    case "businesses": return [
      { title: "Fichas", dataKey: "businesses", action: "business.update", create: true, display: ["name", "slug", "status", "verification", "suspendedAt"], fields: [fName, fSlug, field("categoryId", "Categoría", { kind: "select", options: optionsFrom(data, "categories"), nullable: true }), field("cityId", "Ciudad", { kind: "select", options: optionsFrom(data, "cities"), nullable: true }), field("sourceUrl", "Fuente", { nullable: true }), field("sourceNotes", "Notas de procedencia", { kind: "textarea", nullable: true }), field("status", "Estado", { kind: "select", options: [PENDING, "PUBLICADO", "ARCHIVADO"] }), field("verification", "Verificación", { kind: "select", options: ["PENDIENTE_VERIFICACION", "VERIFICADO", "RECHAZADO"] }), field("suspended", "Suspender negocio", { kind: "checkbox" })] },
      { title: "Propietarios", dataKey: "memberships", action: "business.owner", create: true, display: ["businessId", "userId", "status"], fields: [field("businessId", "Negocio", { kind: "select", options: optionsFrom(data, "businesses"), required: true }), field("userId", "Cuenta verificada", { kind: "select", options: optionsFrom(data, "users", "email"), required: true }), field("status", "Relación", { kind: "select", options: ["PENDIENTE", "ACTIVO", "REVOCADO"] })] },
      { title: "Fotografías", dataKey: "media", action: "media.rights", display: ["sourceUrl", "rights", "businessId"], fields: [field("rights", "Derechos", { kind: "select", options: ["PENDIENTE", "AUTORIZADO", "RECHAZADO"] }), field("altText", "Texto alternativo", { nullable: true })] },
    ];
    default: return [];
  }
}
function contentFields(data: Data, optionalBusiness: boolean): Field[] { return [field("businessId", "Negocio", { kind: "select", options: optionsFrom(data, "businesses"), nullable: optionalBusiness, required: !optionalBusiness }), field("title", "Título", { required: true }), field("description", "Descripción", { kind: "textarea", required: true }), field("status", "Estado", { kind: "select", options: ["BORRADOR", "EN_REVISION", "PUBLICADO", "RECHAZADO", "ARCHIVADO"] }), field("startsAt", "Desde", { kind: "datetime", nullable: true }), field("endsAt", "Hasta", { kind: "datetime", nullable: true })]; }

function prepare(resource: Resource, draft: Row, selected: Row | null): Row {
  const result: Row = {};
  if (selected?.id && resource.action !== "legal.save") result.id = selected.id;
  for (const f of resource.fields) {
    let value = draft[f.key];
    if (f.kind === "number") value = value === "" || value === undefined ? null : f.key === "priceMinor" ? Math.round(Number(value) * 100) : Number(value);
    else if (f.kind === "checkbox") value = value === true;
    else if (f.kind === "datetime") value = value ? new Date(str(value)).toISOString() : null;
    else if (f.nullable && value === "") value = null;
    result[f.key] = value;
  }
  if (resource.action === "benefit.save") result.value = draft.value === "" || draft.value === undefined ? null : draft.key === "max_photos" ? Number(draft.value) : draft.value === true || draft.value === "true";
  if (resource.action === "content.save") {
    result.kind = resource.dataKey === "promotions" ? "promotion" : resource.dataKey === "events" ? "event" : "advertisement";
  }
  if (resource.action === "business.update" && !selected) { delete result.status; delete result.verification; delete result.id; }
  return result;
}
function initial(resource: Resource, selected: Row | null): Row {
  const result: Row = {};
  for (const f of resource.fields) {
    const raw = f.key === "suspended" ? !!selected?.suspendedAt : selected?.[f.key] ?? (f.key === "title" || f.key === "description" ? (selected?.content as Row | undefined)?.[f.key] : undefined);
    const firstOption = f.kind === "select" && !f.nullable ? typeof f.options?.[0] === "string" ? f.options[0] : f.options?.[0]?.value : "";
    const defaultValue = f.key === "status" ? resource.action === "content.save" ? "BORRADOR" : resource.action === "subscription.save" || resource.action === "business.owner" ? "PENDIENTE" : PENDING : firstOption ?? "";
    result[f.key] = f.key === "value" && resource.action === "setting.save" ? textValue(raw) : f.key === "priceMinor" && typeof raw === "number" ? raw / 100 : f.kind === "datetime" && raw ? new Date(str(raw)).toISOString().slice(0, 16) : raw ?? defaultValue;
  }
  return result;
}

export default function AdminPanel() {
  const [section, setSection] = useState<Section>("dashboard");
  const [data, setData] = useState<Data>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobile, setMobile] = useState(false);
  const [resourceIndex, setResourceIndex] = useState(0);
  const [selected, setSelected] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Row>({});
  const available = useMemo(() => resources(section, data), [section, data]);
  const resource = available[resourceIndex] ?? available[0];
  const load = useCallback(async (chosen: Section, index = 0) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/admin?section=${chosen}`, { credentials: "same-origin", cache: "no-store" });
      const body = await response.json() as Row;
      if (!response.ok) throw new Error(str(body.error) || "No se pudieron cargar los datos");
      setData(body);
      const currentResource = resources(chosen, body)[index];
      if (currentResource) setDraft(initial(currentResource, null));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Error de conexión"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = setTimeout(() => { void load(section, resourceIndex); }, 0); return () => clearTimeout(timer); }, [load, section, resourceIndex]);
  async function send(action: string, payload: Row) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, payload }) });
      const body = await response.json() as Row;
      if (!response.ok) throw new Error(str(body.error) || "No se pudo guardar");
      setNotice("Cambio guardado y registrado en auditoría."); setSelected(null); setDraft({}); await load(section, resourceIndex);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Error de conexión"); }
    finally { setBusy(false); }
  }
  function chooseSection(next: Section) { setSection(next); setResourceIndex(0); setSelected(null); setDraft({}); setNotice(""); setMobile(false); }
  function selectRow(row: Row | null) { setSelected(row); if (resource) setDraft(initial(resource, row)); }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!resource) return; await send(resource.action === "business.update" && !selected ? "business.create" : resource.action, prepare(resource, draft, selected)); }
  async function signOut() { await fetch("/api/auth/sign-out", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }); window.location.reload(); }
  return <div className="min-h-screen bg-[#f4f7fa] text-slate-800 md:flex">
    <aside className={`${mobile ? "block" : "hidden"} fixed inset-0 z-30 bg-white p-5 shadow-xl md:sticky md:top-0 md:block md:h-screen md:w-64 md:shrink-0 md:border-r md:border-slate-200 md:shadow-none`}>
      <div className="flex items-start justify-between"><a href="/" className="text-xl font-bold text-[#073b66]">Radar<span className="text-[#10bfc4]">Local</span></a><button className="md:hidden" aria-label="Cerrar menú" onClick={() => setMobile(false)}><X /></button></div>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-400">SUPER_ADMIN</p>
      <nav aria-label="Administración" className="mt-7 grid gap-1 overflow-auto md:max-h-[calc(100vh-180px)]">{menu.map(item => <button key={item.id} onClick={() => chooseSection(item.id)} aria-current={section === item.id ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${section === item.id ? "bg-[#073b66] text-white" : "text-slate-600 hover:bg-slate-100"}`}><item.icon size={18} />{item.label}</button>)}</nav>
      <button onClick={signOut} className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-700"><LogOut size={17} /> Cerrar sesión</button>
    </aside>
    <main className="min-w-0 flex-1 p-4 sm:p-7 lg:p-10">
      <div className="mx-auto max-w-7xl"><div className="mb-7 flex items-center gap-4"><button className="rounded-xl border bg-white p-2 md:hidden" aria-label="Abrir menú" onClick={() => setMobile(true)}><Menu /></button><div><p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">RadarLocal · Administración</p><h1 className="mt-1 text-2xl font-bold text-[#073b66] sm:text-3xl">{menu.find(item => item.id === section)?.label}</h1></div></div>
      {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {notice && <div role="status" className="mb-5 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900">{notice}</div>}
      {loading ? <p role="status" className="rounded-2xl bg-white p-8 text-slate-500">Cargando información…</p> : <>
        {section === "dashboard" && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[["Usuarios", data.users], ["Negocios", data.businesses], ["Solicitudes", data.pendingReviews], ["Fichas publicadas", data.published], ["Suscripciones", data.subscriptions]].map(([label, value]) => <div key={str(label)} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{str(label)}</p><strong className="mt-3 block text-3xl text-[#073b66]">{str(value)}</strong></div>)}</div>}
        {section === "dashboard" && <ActivityList items={rows(data, "activity")} />}
        {section === "audit" && <ActivityList items={rows(data, "activity")} />}
        {section === "users" && <UsersSection data={data} send={send} busy={busy} />}
        {section === "reviews" && <ReviewsSection data={data} reload={() => load(section, resourceIndex)} />}
        {!!available.length && <><div className="mb-4 flex flex-wrap gap-2">{available.map((item, index) => <button key={item.title} onClick={() => { setResourceIndex(index); setSelected(null); setDraft(initial(item, null)); }} className={`rounded-full px-4 py-2 text-sm font-semibold ${resourceIndex === index ? "bg-[#073b66] text-white" : "bg-white text-slate-600"}`}>{item.title}</button>)}</div>
          {resource && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-[#073b66]">{resource.title}</h2>{resource.create && <button onClick={() => selectRow(null)} className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white">+ Nuevo</button>}</div><div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-slate-400">{resource.display.map(column => <th key={column} className="px-2 py-3">{labels[column] ?? column}</th>)}<th className="px-2 py-3">Acción</th></tr></thead><tbody>{rows(data, resource.dataKey).map((row, index) => <tr key={str(row.id ?? row.key ?? index)} className="border-b border-slate-100">{resource.display.map(column => <td key={column} className="max-w-56 truncate px-2 py-3" title={textValue(row[column])}>{display(row[column])}</td>)}<td><button onClick={() => selectRow(row)} className="flex items-center gap-1 font-semibold text-teal-700">{resource.action === "legal.save" ? "Nueva versión" : "Editar"}<ChevronRight size={15} /></button></td></tr>)}</tbody></table>{!rows(data, resource.dataKey).length && <p className="py-8 text-center text-sm text-slate-500">Sin registros. Los valores pendientes se configuran aquí.</p>}</div></section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold text-[#073b66]">{selected ? resource.action === "legal.save" ? "Crear versión" : "Editar registro" : "Nuevo registro"}</h2><p className="mt-1 text-xs text-slate-500">Los cambios quedan auditados. Publica solo datos verificados.</p><form onSubmit={save} className="mt-5 space-y-4">{resource.fields.filter(f => !(resource.action === "business.update" && !selected && ["status", "verification"].includes(f.key))).map(f => {
            const actualField = resource.action === "benefit.save" && f.key === "value" ? { ...f, kind: draft.key === "max_photos" ? "number" as const : "select" as const, options: draft.key === "max_photos" ? undefined : ["", "true", "false"] } : f;
            return <FieldInput key={f.key} field={actualField} value={draft[f.key]} onChange={value => setDraft(old => ({ ...old, [f.key]: value }))} />;
          })}<button disabled={busy} className="w-full rounded-xl bg-[#073b66] px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? "Guardando…" : "Guardar"}</button></form></section></div>}
        </>}
        {section === "businesses" && <BusinessDrafts data={data} reload={() => load(section, resourceIndex)} />}
      </>}
      </div>
    </main>
  </div>;
}

function FieldInput({ field: f, value, onChange }: { field: Field; value: unknown; onChange: (value: unknown) => void }) {
  const classes = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-teal-600";
  const options = (f.options ?? []).map(item => typeof item === "string" ? { value: item, label: item ? labels[item] ?? item : "Sin seleccionar" } : item);
  return <label className="block text-sm font-semibold text-slate-700">{f.label}{f.kind === "select" ? <select required={f.required} value={str(value)} onChange={e => onChange(e.target.value)} className={classes}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : f.kind === "textarea" ? <textarea required={f.required} value={str(value)} onChange={e => onChange(e.target.value)} rows={f.key === "body" ? 10 : 4} className={classes} /> : f.kind === "checkbox" ? <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)} className="ml-3" /> : <input type={f.kind === "number" ? "number" : f.kind === "datetime" ? "datetime-local" : "text"} min={f.kind === "number" ? 0 : undefined} required={f.required} value={str(value)} onChange={e => onChange(e.target.value)} className={classes} />}</label>;
}
function ActivityList({ items }: { items: Row[] }) { return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="mb-4 text-lg font-bold text-[#073b66]">Actividad reciente</h2><div className="divide-y">{items.map(item => <div key={str(item.id)} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_1fr_150px]"><b>{str(item.action)}</b><span>{str(item.entityType)} · {str(item.entityId)}</span><time className="text-slate-500">{str(item.createdAt).slice(0, 19).replace("T", " ")}</time></div>)}{!items.length && <p className="text-sm text-slate-500">Aún no hay actividad registrada.</p>}</div></section>; }
function UsersSection({ data, send, busy }: { data: Data; send: (action: string, payload: Row) => Promise<void>; busy: boolean }) {
  const [selected, setSelected] = useState(""); const [role, setRole] = useState("ADMIN"); const [enabled, setEnabled] = useState(true);
  return <div className="grid gap-5 lg:grid-cols-[1fr_320px]"><section className="overflow-x-auto rounded-2xl border bg-white p-5"><h2 className="mb-4 text-lg font-bold text-[#073b66]">Cuentas verificadas y roles</h2><div className="space-y-2">{rows(data, "users").map(row => <button key={str(row.id)} onClick={() => setSelected(str(row.id))} className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-left text-sm ${selected === row.id ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}><span><b>{str(row.name)}</b><span className="ml-2 text-slate-500">{str(row.email)}</span></span><span className="text-xs text-slate-500">{row.emailVerified ? "Verificado" : "Sin verificar"} · {rows(data, "roles").filter(grant => grant.userId === row.id).map(grant => str(grant.role)).join(", ") || "Sin rol"}</span></button>)}</div></section><form onSubmit={e => { e.preventDefault(); void send("user.role", { userId: selected, role, enabled }); }} className="h-fit rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold text-[#073b66]">Administrar acceso</h2><p className="mt-2 text-sm text-slate-500">Solo cuentas verificadas. El rol SUPER_ADMIN se crea mediante el procedimiento seguro.</p><label className="mt-4 block text-sm">Rol<select value={role} onChange={e => setRole(e.target.value)} className="mt-1 w-full rounded-xl border p-3"><option>ADMIN</option><option>BUSINESS_OWNER</option></select></label><label className="mt-4 block text-sm">Acción<select value={enabled ? "grant" : "revoke"} onChange={e => setEnabled(e.target.value === "grant")} className="mt-1 w-full rounded-xl border p-3"><option value="grant">Asignar</option><option value="revoke">Revocar</option></select></label><button disabled={!selected || busy} className="mt-5 w-full rounded-xl bg-[#073b66] p-3 font-semibold text-white disabled:opacity-50">Guardar rol</button></form></div>;
}
function ReviewsSection({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [reason, setReason] = useState(""); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function decide(requestId: string, decision: string) {
    setBusy(requestId); setError("");
    try { const response = await fetch(`/api/reviews/${requestId}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, reason }) }); const result = await response.json() as Row; if (!response.ok) throw new Error(str(result.error) || "No se pudo revisar"); setReason(""); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Error de conexión"); } finally { setBusy(""); }
  }
  return <div className="space-y-5">{error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}{rows(data, "requests").map(request => {
    const revision = rows(data, "revisions").find(row => row.id === request.revisionId);
    const publication = rows(data, "publications").find(row => row.businessId === request.businessId);
    const publicRevision = rows(data, "revisions").find(row => row.id === publication?.revisionId);
    const business = rows(data, "businesses").find(row => row.id === request.businessId);
    const proposed = revision?.snapshot && typeof revision.snapshot === "object" ? revision.snapshot as Row : {};
    const current = publicRevision?.snapshot && typeof publicRevision.snapshot === "object" ? publicRevision.snapshot as Row : {};
    const keys = Array.from(new Set([...Object.keys(proposed), ...Object.keys(current)])).filter(key => JSON.stringify(proposed[key]) !== JSON.stringify(current[key]));
    return <article key={str(request.id)} className="rounded-2xl border bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-[#073b66]">{str(business?.name ?? request.businessId)}</h2><p className="text-sm text-slate-500">Versión propuesta {str(revision?.version)} · {str(request.status)}</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">{str(request.status)}</span></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[550px] text-sm"><thead><tr className="text-left text-slate-500"><th className="py-2">Campo</th><th>Versión pública</th><th>Propuesta</th></tr></thead><tbody>{keys.map(key => <tr key={key} className="border-t"><td className="py-2 font-semibold">{key}</td><td className="max-w-56 break-words pr-3">{short(current[key])}</td><td className="max-w-56 break-words">{short(proposed[key])}</td></tr>)}</tbody></table>{!keys.length && <p className="py-3 text-sm text-slate-500">Sin diferencias de campos.</p>}</div>{request.status === "PENDIENTE" && <div className="mt-5"><label className="block text-sm font-semibold">Motivo para rechazo o correcciones<textarea value={reason} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-xl border p-3" rows={2} /></label><div className="mt-3 flex flex-wrap gap-2"><button disabled={!!busy} onClick={() => decide(str(request.id), "APROBADA")} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Aprobar</button><button disabled={!!busy || !reason.trim()} onClick={() => decide(str(request.id), "RECHAZADA")} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">Rechazar</button><button disabled={!!busy || !reason.trim()} onClick={() => decide(str(request.id), "CORRECCIONES_SOLICITADAS")} className="rounded-lg border px-4 py-2 text-sm font-semibold">Pedir correcciones</button></div></div>}</article>;
  })}{!rows(data, "requests").length && <p className="rounded-2xl bg-white p-8 text-slate-500">No hay solicitudes de revisión.</p>}</div>;
}
function BusinessDrafts({ data, reload }: { data: Data; reload: () => Promise<void> }) {
  const [businessId, setBusinessId] = useState(""); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [categoryId, setCategoryId] = useState(""); const [cityId, setCityId] = useState(""); const [message, setMessage] = useState("");
  function selectBusiness(next: string) {
    setBusinessId(next);
    const business = rows(data, "businesses").find(row => row.id === next);
    const publication = rows(data, "publications").find(row => row.businessId === next);
    const revision = rows(data, "revisions").find(row => row.id === publication?.revisionId);
    const snapshot = revision?.snapshot && typeof revision.snapshot === "object" ? revision.snapshot as Row : {};
    setName(str(snapshot.name ?? business?.name)); setDescription(str(snapshot.description));
    setCategoryId(str(snapshot.categoryId ?? business?.categoryId)); setCityId(str(snapshot.cityId ?? business?.cityId));
  }
  async function action(path: string, body?: Row) {
    setMessage(""); const response = await fetch(path, { method: body ? "PUT" : "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : "{}" }); const result = await response.json() as Row; setMessage(response.ok ? "Solicitud guardada. Revisa la cola de aprobaciones." : str(result.error) || "No se pudo guardar"); if (response.ok) await reload();
  }
  return <section className="mt-6 rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold text-[#073b66]">Borrador de ficha</h2><p className="mt-1 text-sm text-slate-500">La ficha pública cambia únicamente tras una aprobación.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><select aria-label="Negocio" value={businessId} onChange={e => selectBusiness(e.target.value)} className="rounded-xl border p-3"><option value="">Selecciona negocio</option>{rows(data, "businesses").map(row => <option key={str(row.id)} value={str(row.id)}>{str(row.name)}</option>)}</select><input aria-label="Nombre propuesto" value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" className="rounded-xl border p-3" /><textarea aria-label="Descripción" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descripción verificada" className="rounded-xl border p-3 sm:col-span-2" /><select aria-label="Categoría" value={categoryId} onChange={e => setCategoryId(e.target.value)} className="rounded-xl border p-3"><option value="">Categoría publicada</option>{rows(data, "categories").map(row => <option key={str(row.id)} value={str(row.id)}>{str(row.name)}</option>)}</select><select aria-label="Ciudad" value={cityId} onChange={e => setCityId(e.target.value)} className="rounded-xl border p-3"><option value="">Ciudad</option>{rows(data, "cities").map(row => <option key={str(row.id)} value={str(row.id)}>{str(row.name)}</option>)}</select></div><div className="mt-4 flex flex-wrap gap-2"><button disabled={!businessId || !categoryId || !cityId || description.length < 10} onClick={() => action(`/api/businesses/${businessId}/draft`, { name, description, categoryId, cityId, address: null, phone: null, website: null, services: [], amenityIds: [], mediaAssetIds: [] })} className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40">Guardar borrador</button><button disabled={!businessId} onClick={() => action(`/api/businesses/${businessId}/submit`)} className="rounded-xl bg-[#073b66] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Enviar a revisión</button></div>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</section>;
}


