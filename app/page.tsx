"use client";

import "aws-amplify/auth/enable-oauth-listener";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { fetchAuthSession, getCurrentUser, signInWithRedirect, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";

type UploadState = "idle" | "requesting" | "uploading" | "success" | "error";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const API_URL = process.env.NEXT_PUBLIC_UPLOAD_API_URL;

export default function Home() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser.username);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Authentication state is an external system synchronized into this client component.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadUser();
    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signInWithRedirect") loadUser();
      if (payload.event === "signInWithRedirect_failure") setMessage("Sign-in failed. Please try again.");
    });
    return unsubscribe;
  }, []);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setMessage("");
    setUploadState("idle");
    setProgress(0);
    if (!file) return setSelectedFile(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setSelectedFile(null);
      setUploadState("error");
      return setMessage("Unsupported file type. Upload a PDF, JPG, JPEG, or PNG.");
    }
    if (file.size > MAX_FILE_SIZE) {
      setSelectedFile(null);
      setUploadState("error");
      return setMessage("This file is larger than the 10 MB limit.");
    }
    setSelectedFile(file);
  };

  const uploadFile = async () => {
    if (!selectedFile) return setMessage("Choose an invoice before uploading.");
    if (!API_URL) {
      setUploadState("error");
      return setMessage("Upload service is not configured. Set NEXT_PUBLIC_UPLOAD_API_URL.");
    }

    try {
      setUploadState("requesting");
      setProgress(0);
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      if (!token) throw new Error("Your session has expired. Please sign in again.");

      const urlResponse = await fetch(API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          contentType: selectedFile.type,
          fileSize: selectedFile.size,
        }),
      });
      const payload = await urlResponse.json().catch(() => ({}));
      if (!urlResponse.ok || !payload.uploadUrl) throw new Error(payload.error ?? "Could not prepare secure upload.");

      setUploadState("uploading");
      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", payload.uploadUrl);
        request.setRequestHeader("Content-Type", selectedFile.type);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
        };
        request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("S3 rejected the upload."));
        request.onerror = () => reject(new Error("Network error while uploading to S3."));
        request.send(selectedFile);
      });
      setUploadState("success");
      setProgress(100);
      setMessage("Invoice uploaded securely. Verification is ready for the next milestone.");
    } catch (error) {
      setUploadState("error");
      setMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setSelectedFile(null);
    setUploadState("idle");
  };

  if (loading) return <main className="min-h-screen bg-[#06111f] p-8 text-slate-400">Checking authentication...</main>;

  return (
    <main className="min-h-screen bg-[#06111f] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 font-black text-slate-950">TS</div><div><p className="text-sm font-semibold tracking-wide text-cyan-300">TRUSTED SUPPLIER</p><p className="text-xs text-slate-500">Verification workspace</p></div></div>
          {user && <button onClick={handleSignOut} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-300/50 hover:text-white">Sign out</button>}
        </header>

        {!user ? <section className="mx-auto flex w-full max-w-xl flex-1 items-center"><div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-cyan-950/30"><p className="text-sm font-medium text-cyan-300">PAYMENT SECURITY FOR SMALL BUSINESS</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Stop invoice fraud before it reaches your bank.</h1><p className="mt-4 leading-7 text-slate-400">Sign in to securely upload an invoice. Your file stays private while we prepare it for supplier verification.</p><button onClick={() => signInWithRedirect()} className="mt-8 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">Sign in with Cognito</button></div></section> : <section className="flex-1 py-12"><div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-medium text-cyan-300">CONTROL CENTER / INVOICE INTAKE</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Verify before you pay.</h1><p className="mt-3 max-w-2xl text-slate-400">Upload an invoice to begin a secure supplier payment-details review.</p></div><div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">● Protected session</div></div><div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]"><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-cyan-950/20 md:p-8"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">New invoice</h2><p className="mt-1 text-sm text-slate-500">Private upload · up to 10 MB</p></div><span className="rounded-lg bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-300">STEP 01 / 03</span></div><button onClick={() => fileInputRef.current?.click()} className="mt-8 flex min-h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/30 bg-slate-950/40 px-6 text-center transition hover:border-cyan-300 hover:bg-cyan-400/[0.04]"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400/10 text-2xl text-cyan-300">↑</div><span className="font-medium">{selectedFile ? selectedFile.name : "Choose invoice file"}</span><span className="mt-2 text-sm text-slate-500">PDF, JPG, JPEG, or PNG</span></button><input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={chooseFile} className="hidden" />{selectedFile && <div className="mt-5 flex items-center justify-between rounded-xl border border-white/10 bg-slate-950/50 p-4"><div><p className="text-sm font-medium">{selectedFile.name}</p><p className="mt-1 text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type || "unknown type"}</p></div><button onClick={() => { setSelectedFile(null); setUploadState("idle"); setProgress(0); if (fileInputRef.current) fileInputRef.current.value = ""; }} className="text-xs text-slate-500 hover:text-white">Remove</button></div>}<button disabled={!selectedFile || uploadState === "requesting" || uploadState === "uploading"} onClick={uploadFile} className="mt-5 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40">{uploadState === "requesting" ? "Preparing secure upload..." : uploadState === "uploading" ? `Uploading ${progress}%` : "Upload securely"}</button>{(uploadState === "requesting" || uploadState === "uploading") && <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} /></div>}{message && <p className={`mt-4 rounded-xl border p-3 text-sm ${uploadState === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-rose-400/20 bg-rose-400/10 text-rose-300"}`}>{message}</p>}</div><aside className="space-y-6"><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-sm font-medium text-slate-400">SECURITY STATUS</p><div className="mt-5 space-y-4 text-sm"><div className="flex items-center justify-between"><span className="text-slate-400">Authentication</span><span className="text-emerald-300">Verified</span></div><div className="flex items-center justify-between"><span className="text-slate-400">Storage</span><span className="text-emerald-300">Private S3</span></div><div className="flex items-center justify-between"><span className="text-slate-400">Encryption</span><span className="text-emerald-300">AES-256</span></div></div></div><div className="rounded-3xl border border-cyan-300/15 bg-cyan-400/[0.05] p-6"><p className="text-sm font-medium text-cyan-300">WHAT HAPPENS NEXT</p><p className="mt-3 text-sm leading-6 text-slate-400">Your upload is stored under your private user identity. Supplier matching and payment-detail verification will be added in the next milestone.</p></div></aside></div></section>}
        <footer className="border-t border-white/10 pt-5 text-xs text-slate-600">Trusted Supplier Verification · Secure invoice intake</footer>
      </div>
    </main>
  );
}
