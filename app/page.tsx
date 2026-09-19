"use client";

import "aws-amplify/auth/enable-oauth-listener";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { fetchAuthSession, getCurrentUser, signInWithRedirect, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import {
  DEMO_OWNER_ID,
  demoExtractionFixtures,
  demoInvoiceDocuments,
  demoTrustedSuppliers,
  demoVerificationScenarios,
  InMemoryTrustedSupplierRepository,
} from "../domain/demo-data";
import { MockInvoiceExtractionAdapter, processInvoiceDocument, type InvoiceVerificationPipelineResult } from "../domain/extraction";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const API_URL = process.env.NEXT_PUBLIC_UPLOAD_API_URL;
const demoAdapter = new MockInvoiceExtractionAdapter(demoExtractionFixtures);
const demoRepository = new InMemoryTrustedSupplierRepository(demoTrustedSuppliers);

type UploadState = "idle" | "requesting" | "uploading" | "success" | "error";
type DemoStage = "idle" | "uploading" | "extracting" | "checking" | "comparing" | "complete" | "error";

const stages: Array<{ id: Exclude<DemoStage, "idle" | "complete" | "error">; label: string }> = [
  { id: "uploading", label: "Uploading invoice" },
  { id: "extracting", label: "Extracting invoice details" },
  { id: "checking", label: "Checking trusted supplier" },
  { id: "comparing", label: "Comparing payment details" },
];

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export default function Home() {
  const [user, setUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState("matching-details");
  const [demoStage, setDemoStage] = useState<DemoStage>("idle");
  const [demoResult, setDemoResult] = useState<InvoiceVerificationPipelineResult | null>(null);
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
        body: JSON.stringify({ fileName: selectedFile.name, contentType: selectedFile.type, fileSize: selectedFile.size }),
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
      setMessage("Invoice uploaded securely. Choose a DEMO scenario below to walk through verification.");
    } catch (error) {
      setUploadState("error");
      setMessage(error instanceof Error ? error.message : "Upload failed. Please try again.");
    }
  };

  const runDemo = async () => {
    const document = demoInvoiceDocuments.find((item) => item.id === selectedScenarioId);
    if (!document) return;
    setDemoResult(null);
    setDemoStage("uploading");
    await wait(500);
    setDemoStage("extracting");
    await wait(650);
    setDemoStage("checking");
    await wait(650);
    setDemoStage("comparing");
    await wait(650);
    const result = await processInvoiceDocument(document, demoAdapter, demoRepository, DEMO_OWNER_ID);
    setDemoResult(result);
    setDemoStage("complete");
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
    setSelectedFile(null);
    setUploadState("idle");
    setDemoStage("idle");
    setDemoResult(null);
  };

  if (loading) return <main className="min-h-screen bg-[#06111f] p-8 text-slate-400">Checking authentication...</main>;

  return (
    <main className="min-h-screen bg-[#06111f] text-white">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400 font-black text-slate-950">TS</div><div><p className="text-sm font-semibold tracking-wide text-cyan-300">TRUSTED SUPPLIER</p><p className="text-xs text-slate-500">Verification workspace</p></div></div>
          {user && <button onClick={handleSignOut} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 transition hover:border-cyan-300/50 hover:text-white">Sign out</button>}
        </header>

        {!user ? <section className="mx-auto flex w-full max-w-xl flex-1 items-center"><div className="w-full rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl shadow-cyan-950/30"><p className="text-sm font-medium text-cyan-300">PAYMENT SECURITY FOR SMALL BUSINESS</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Stop invoice fraud before it reaches your bank.</h1><p className="mt-4 leading-7 text-slate-400">Sign in to securely upload an invoice or explore the transparent local demo workflow.</p><button onClick={() => signInWithRedirect()} className="mt-8 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">Sign in with Cognito</button></div></section> : <section className="flex-1 py-12">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><div className="flex items-center gap-3"><p className="text-sm font-medium text-cyan-300">CONTROL CENTER / INVOICE INTAKE</p><span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-semibold tracking-wide text-amber-200">DEMO MODE</span></div><h1 className="mt-2 text-4xl font-semibold tracking-tight">Verify before you pay.</h1><p className="mt-3 max-w-2xl text-slate-400">Compare invoice payment details against a trusted supplier record. Results indicate risk and verification status; they do not prove fraud.</p></div><div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-300">● Protected session</div></div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-cyan-950/20 md:p-8"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Verify Invoice</h2><p className="mt-1 text-sm text-slate-500">Choose a transparent DEMO invoice to run locally.</p></div><span className="rounded-lg bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-300">DEMO / LOCAL</span></div><div className="mt-6 space-y-3">{demoVerificationScenarios.map((scenario) => { const selected = selectedScenarioId === scenario.id; return <button key={scenario.id} onClick={() => { setSelectedScenarioId(scenario.id); setDemoResult(null); setDemoStage("idle"); }} className={`w-full rounded-2xl border p-4 text-left transition ${selected ? "border-cyan-300/60 bg-cyan-400/[0.08]" : "border-white/10 bg-slate-950/30 hover:border-cyan-300/30"}`}><div className="flex items-center justify-between gap-3"><span className="font-medium">{scenario.label}</span><span className="text-xs text-slate-500">{scenario.invoice.invoiceNumber}</span></div><p className="mt-2 text-sm text-slate-400">{scenario.description}</p></button>; })}</div><button onClick={runDemo} disabled={demoStage !== "idle" && demoStage !== "complete" && demoStage !== "error"} className="mt-6 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-50">{demoStage !== "idle" && demoStage !== "complete" && demoStage !== "error" ? "Verifying invoice..." : "Verify Invoice"}</button></div>

              <div className="rounded-3xl border border-cyan-300/10 bg-cyan-400/[0.03] p-6"><p className="text-xs font-medium tracking-wide text-cyan-300">PROCESSING PIPELINE</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{stages.map((stage, index) => { const activeIndex = stages.findIndex((item) => item.id === demoStage); const active = activeIndex >= index || demoStage === "complete"; return <div key={stage.id} className={`rounded-xl border p-4 ${active ? "border-cyan-300/40 bg-cyan-400/[0.08]" : "border-white/10 bg-slate-950/30"}`}><span className={`text-xs ${active ? "text-cyan-300" : "text-slate-600"}`}>0{index + 1}</span><p className={`mt-2 text-sm font-medium ${active ? "text-slate-200" : "text-slate-500"}`}>{stage.label}</p></div>; })}</div><p className="mt-4 text-xs text-slate-600">Mock extraction and local supplier storage power this demo. Production adapters for S3, Bedrock, and DynamoDB remain separate integration boundaries.</p></div>
            </div>

            <aside className="space-y-6"><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-sm font-medium text-slate-400">VERIFICATION RESULT</p>{!demoResult ? <div className="mt-8"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-400/10 text-2xl text-cyan-300">✓</div><h2 className="mt-5 text-2xl font-semibold">Ready for review</h2><p className="mt-3 text-sm leading-6 text-slate-500">Select one of the three DEMO invoices and run the real local extraction-to-verification pipeline.</p></div> : <ResultCard result={demoResult} />}</div><div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-sm font-medium text-slate-400">SECURITY STATUS</p><div className="mt-5 space-y-4 text-sm"><div className="flex items-center justify-between"><span className="text-slate-400">Authentication</span><span className="text-emerald-300">Verified</span></div><div className="flex items-center justify-between"><span className="text-slate-400">Payment display</span><span className="text-emerald-300">Masked</span></div><div className="flex items-center justify-between"><span className="text-slate-400">Decision mode</span><span className="text-amber-200">Demo only</span></div></div></div></aside>
          </div>

          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><p className="text-sm font-medium text-cyan-300">OPTIONAL / SECURE UPLOAD</p><p className="mt-2 text-sm text-slate-400">The existing authenticated presigned-S3 upload remains available for deployed environments.</p></div><button onClick={() => fileInputRef.current?.click()} className="rounded-xl border border-cyan-300/30 px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-400/[0.06]">Choose invoice file</button></div><input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={chooseFile} className="hidden" />{selectedFile && <div className="mt-5 flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">{selectedFile.name}</p><p className="mt-1 text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB · {selectedFile.type || "unknown type"}</p></div><button onClick={uploadFile} disabled={uploadState === "requesting" || uploadState === "uploading"} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{uploadState === "requesting" ? "Preparing..." : uploadState === "uploading" ? `Uploading ${progress}%` : "Upload securely"}</button></div>}{message && <p className={`mt-4 rounded-xl border p-3 text-sm ${uploadState === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-rose-400/20 bg-rose-400/10 text-rose-300"}`}>{message}</p>}</div>
        </section>}
        <footer className="border-t border-white/10 pt-5 text-xs text-slate-600">Trusted Supplier Verification · Secure invoice intake · DEMO data only</footer>
      </div>
    </main>
  );
}

function ResultCard({ result }: { result: InvoiceVerificationPipelineResult }) {
  const verification = result.verification;
  const tone = verification.status === "LOW_RISK" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : verification.status === "HIGH_RISK" ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : "border-amber-400/30 bg-amber-400/10 text-amber-200";
  const changedFieldLabels = verification.changedFields?.map((field) => field === "bankAccountNumber" ? "Bank account" : field === "ifsc" ? "IFSC" : "UPI ID");
  return <div className="mt-5"><div className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${tone}`}>{verification.status.replace("_", " ")}</div><h2 className="mt-5 text-2xl font-semibold">{verification.title}</h2><p className="mt-3 text-sm leading-6 text-slate-400">{verification.explanation}</p><div className="mt-5 space-y-3 text-sm"><div className="flex items-center justify-between gap-4"><span className="text-slate-500">Supplier</span><span className="text-right text-slate-200">{verification.supplierName}</span></div>{verification.previousMaskedAccount && verification.invoiceMaskedAccount && <><div className="flex items-center justify-between gap-4"><span className="text-slate-500">Trusted account</span><span className="text-slate-200">{verification.previousMaskedAccount}</span></div><div className="flex items-center justify-between gap-4"><span className="text-slate-500">Invoice account</span><span className="text-slate-200">{verification.invoiceMaskedAccount}</span></div></>}{changedFieldLabels && changedFieldLabels.length > 0 && <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3"><span className="text-xs text-rose-300">Changed fields</span><p className="mt-1 text-sm text-slate-200">{changedFieldLabels.join(" · ")}</p></div>}{result.extractionIssues.length > 0 && <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3"><span className="text-xs text-amber-200">Review reason</span><p className="mt-1 text-sm text-slate-300">{result.extractionIssues.join(" ")}</p></div>}</div></div>;
}
