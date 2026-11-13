"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Vinext dev currently optimizes next/link inconsistently on this isolated route. */

import { useState, type FormEvent } from "react";

export default function AdminSignIn({ unavailable = false }: { unavailable?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ email, password }) });
      if (!response.ok) throw new Error("No se pudo iniciar sesión. Revisa tus datos y la verificación de correo.");
      window.location.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Error de conexión"); setBusy(false); }
  }
  return <main className="min-h-screen bg-[#f5f8fa] flex items-center justify-center p-5">
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/5">
      <a href="/" className="text-sm font-semibold text-teal-700">← Volver a RadarLocal</a>
      <div className="mt-8 text-xs font-bold uppercase tracking-[.2em] text-teal-700">Administración</div>
      <h1 className="mt-2 text-3xl font-bold text-[#073b66]">SUPER_ADMIN</h1>
      <p className="mt-3 text-sm text-slate-600">Accede con tu cuenta verificada de RadarLocal.</p>
      {unavailable ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Autenticación pendiente de configurar en este entorno.</p> : <form onSubmit={signIn} className="mt-7 space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Correo<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-teal-600" /></label>
        <label className="block text-sm font-semibold text-slate-700">Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-teal-600" /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-[#073b66] px-5 py-3 font-semibold text-white disabled:opacity-60">{busy ? "Entrando…" : "Entrar"}</button>
      </form>}
    </div>
  </main>;
}
