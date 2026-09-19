import type { InvoiceDocument } from "./extraction";
import type { InvoicePaymentDetails, TrustedSupplier } from "./verification";

export const DEMO_OWNER_ID = "demo-owner";

export const demoTrustedSuppliers: TrustedSupplier[] = [
  {
    id: "demo-supplier-abc",
    ownerId: DEMO_OWNER_ID,
    name: "ABC Traders",
    bankAccountNumber: "001234567890",
    ifsc: "HDFC0001234",
    upiId: "payments@abctraders.demo",
    verified: true,
    createdAt: "2026-01-10T10:00:00.000Z",
    updatedAt: "2026-01-10T10:00:00.000Z",
  },
  {
    id: "demo-supplier-nova",
    ownerId: DEMO_OWNER_ID,
    name: "Nova Office Supplies",
    bankAccountNumber: "009876543210",
    ifsc: "ICIC0005678",
    upiId: "nova@icici.demo",
    verified: true,
    createdAt: "2026-02-02T10:00:00.000Z",
    updatedAt: "2026-02-02T10:00:00.000Z",
  },
];

export interface DemoVerificationScenario {
  id: string;
  label: string;
  description: string;
  invoice: InvoicePaymentDetails;
}

export const demoVerificationScenarios: DemoVerificationScenario[] = [
  {
    id: "matching-details",
    label: "DEMO · Matching supplier",
    description: "Existing supplier with matching payment details.",
    invoice: {
      supplierName: "A.B.C. Traders",
      bankAccountNumber: "0012 3456 7890",
      ifsc: "hdfc0001234",
      upiId: "payments@abctraders.demo",
      invoiceNumber: "DEMO-1001",
      invoiceAmount: 42500,
      invoiceDate: "2026-09-01",
    },
  },
  {
    id: "changed-bank-details",
    label: "DEMO · Changed bank account",
    description: "Existing supplier with a different account number.",
    invoice: {
      supplierName: "ABC Traders",
      bankAccountNumber: "0099 8877 6655",
      ifsc: "HDFC0001234",
      upiId: "payments@abctraders.demo",
      invoiceNumber: "DEMO-1002",
      invoiceAmount: 42500,
      invoiceDate: "2026-09-02",
    },
  },
  {
    id: "new-supplier",
    label: "DEMO · New supplier",
    description: "Supplier is not present in the trusted registry.",
    invoice: {
      supplierName: "Kite Packaging Co.",
      bankAccountNumber: "007700112233",
      ifsc: "SBIN0002468",
      upiId: "kitepackaging@sbi.demo",
      invoiceNumber: "DEMO-1003",
      invoiceAmount: 18900,
      invoiceDate: "2026-09-03",
    },
  },
];

export const demoInvoiceDocuments: InvoiceDocument[] = demoVerificationScenarios.map((scenario) => ({
  id: scenario.id,
  fileName: `${scenario.id}.pdf`,
  contentType: "application/pdf",
  demoLabel: scenario.label,
}));

export const demoExtractionFixtures = new Map(
  demoVerificationScenarios.map((scenario) => [scenario.id, scenario.invoice]),
);
