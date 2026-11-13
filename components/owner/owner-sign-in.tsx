"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Evita la optimización inconsistente de next/link en Vinext dev. */
import { useState, type FormEvent } from "react";

export default function OwnerSignIn({ unavailable = false, denied = false }: { unavailable?: boolean; denied?: boolean }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const response = await fetch("/api/auth/sign-in/email", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }); if (!response.ok) throw new Error("Revisa tus datos y la verificación de correo."); location.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Error de conexión"); setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f8fa] p-5"><div className="w-full max-w-md rounded-3xl border bg-white p-8 shadow-lg shadow-slate-900/5"><a href="/" className="text-sm font-semibold text-teal-700">← RadarLocal</a><p className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-teal-700">Mi negocio</p><h1 className="mt-2 text-3xl font-bold text-[#073b66]">Panel de propietario</h1><p className="mt-3 text-sm text-slate-600">Usa tu cuenta verificada de RadarLocal.</p>{unavailable ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900">La autenticación no está configurada en este entorno.</p> : <form onSubmit={signIn} className="mt-7 space-y-4"><label className="block text-sm font-semibold">Correo<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label><label className="block text-sm font-semibold">Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border p-3" /></label>{denied && <p role="alert" className="text-sm text-amber-800">Esta cuenta no tiene acceso de propietario a esta página.</p>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} className="w-full rounded-xl bg-[#073b66] p-3 font-semibold text-white disabled:opacity-50">{busy ? "Entrando…" : "Entrar"}</button></form>}</div></main>;
}
