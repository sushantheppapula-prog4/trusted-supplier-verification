import {
  validateInvoicePaymentDetails,
  type InvoicePaymentDetails,
  type VerificationResult,
  verifyInvoicePayment,
} from "./verification";
import type { InvoiceDocument, InvoiceExtractionAdapter, TrustedSupplierRepository } from "./ports";
import type { TrustedSupplier } from "./verification";

export class MockInvoiceExtractionAdapter implements InvoiceExtractionAdapter {
  private readonly documents: ReadonlyMap<string, InvoicePaymentDetails>;

  constructor(documents: ReadonlyMap<string, InvoicePaymentDetails>) {
    this.documents = documents;
  }

  async extract(document: InvoiceDocument): Promise<InvoicePaymentDetails> {
    const extracted = this.documents.get(document.id);
    if (!extracted) throw new Error(`No DEMO extraction fixture found for ${document.id}`);
    return { ...extracted };
  }
}

/** Reserved for a future Lambda → Bedrock implementation. It deliberately makes no AWS calls. */
export class BedrockInvoiceExtractionAdapter implements InvoiceExtractionAdapter {
  async extract(document: InvoiceDocument): Promise<InvoicePaymentDetails> {
    void document;
    throw new Error("Bedrock extraction is not enabled in the local milestone.");
  }
}

export interface InvoiceVerificationPipelineResult {
  extraction: InvoicePaymentDetails | null;
  extractionIssues: string[];
  verification: VerificationResult;
}

export async function processInvoiceDocument(
  document: InvoiceDocument,
  adapter: InvoiceExtractionAdapter,
  supplierSource: TrustedSupplierRepository | TrustedSupplier[],
  ownerId: string,
): Promise<InvoiceVerificationPipelineResult> {
  try {
    const extraction = await adapter.extract(document);
    const issues = validateInvoicePaymentDetails(extraction);
    if (issues.length > 0) {
      return {
        extraction,
        extractionIssues: issues.map((issue) => `${issue.field}: ${issue.message}`),
        verification: {
          status: "REVIEW_REQUIRED",
          title: "Extraction needs review",
          explanation: "The invoice could not be safely verified because extracted payment information is incomplete or malformed.",
          supplierName: extraction.supplierName.trim() || "Unknown supplier",
          checkedAt: new Date().toISOString(),
        },
      };
    }

    const suppliers = Array.isArray(supplierSource)
      ? supplierSource
      : await supplierSource.listByOwner(ownerId);
    return {
      extraction,
      extractionIssues: [],
      verification: verifyInvoicePayment(extraction, suppliers, ownerId),
    };
  } catch (error) {
    return {
      extraction: null,
      extractionIssues: [error instanceof Error ? error.message : "Invoice extraction failed."],
      verification: {
        status: "REVIEW_REQUIRED",
        title: "Extraction unavailable",
        explanation: "Invoice extraction is unavailable — manual verification required.",
        supplierName: "Unknown supplier",
        checkedAt: new Date().toISOString(),
      },
    };
  }
}
