import type { InvoicePaymentDetails, TrustedSupplier } from "./verification";

export interface TrustedSupplierRepository {
  listByOwner(ownerId: string): Promise<TrustedSupplier[]>;
}

export interface InvoiceDocument {
  id: string;
  fileName: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
  demoLabel?: string;
}

export interface InvoiceDocumentSource {
  get(documentKey: string): Promise<InvoiceDocument>;
}

export interface InvoiceExtractionAdapter {
  extract(document: InvoiceDocument): Promise<InvoicePaymentDetails>;
}
