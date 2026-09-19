export type VerificationStatus = "LOW_RISK" | "REVIEW_REQUIRED" | "HIGH_RISK";

export interface TrustedSupplier {
  id: string;
  ownerId: string;
  name: string;
  bankAccountNumber: string;
  ifsc: string;
  upiId?: string;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvoicePaymentDetails {
  supplierName: string;
  bankAccountNumber: string;
  ifsc: string;
  upiId?: string;
  invoiceNumber: string;
  invoiceAmount: number;
  invoiceDate: string;
}

export interface VerificationResult {
  status: VerificationStatus;
  title: string;
  explanation: string;
  supplierId?: string;
  supplierName: string;
  previousMaskedAccount?: string;
  invoiceMaskedAccount?: string;
  checkedAt: string;
}

export interface TrustedSupplierRepository {
  listByOwner(ownerId: string): Promise<TrustedSupplier[]>;
}

export interface InvoiceExtractionAdapter {
  extract(fileKey: string): Promise<InvoicePaymentDetails>;
}

export interface PaymentValidationIssue {
  field: keyof InvoicePaymentDetails;
  message: string;
}

export function normalizeSupplierName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeBankAccount(value: string): string {
  return value.replace(/[\s-]/g, "").trim();
}

export function normalizeIfsc(value: string): string {
  return value.replace(/\s/g, "").toUpperCase();
}

export function normalizeUpi(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function maskAccount(value: string): string {
  const normalized = normalizeBankAccount(value);
  return normalized.length <= 4 ? "••••" : `•••• ${normalized.slice(-4)}`;
}

export function validateInvoicePaymentDetails(payment: InvoicePaymentDetails): PaymentValidationIssue[] {
  const issues: PaymentValidationIssue[] = [];
  const account = normalizeBankAccount(payment.bankAccountNumber);
  const ifsc = normalizeIfsc(payment.ifsc);
  const upi = normalizeUpi(payment.upiId);
  if (!normalizeSupplierName(payment.supplierName)) issues.push({ field: "supplierName", message: "Supplier name is missing." });
  if (!/^\d{6,20}$/.test(account)) issues.push({ field: "bankAccountNumber", message: "Bank account number must contain 6–20 digits." });
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) issues.push({ field: "ifsc", message: "IFSC must match the expected 11-character format." });
  if (upi && !/^[a-z0-9][a-z0-9._-]{1,}@[a-z0-9][a-z0-9.-]{1,}$/.test(upi)) issues.push({ field: "upiId", message: "UPI ID format is invalid." });
  if (!payment.invoiceNumber.trim()) issues.push({ field: "invoiceNumber", message: "Invoice number is missing." });
  if (!Number.isFinite(payment.invoiceAmount) || payment.invoiceAmount < 0) issues.push({ field: "invoiceAmount", message: "Invoice amount is invalid." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payment.invoiceDate)) issues.push({ field: "invoiceDate", message: "Invoice date must use YYYY-MM-DD." });
  return issues;
}

function optionalIdentifierMatches(trusted?: string, invoice?: string): boolean {
  return normalizeUpi(trusted) === normalizeUpi(invoice);
}

export function verifyInvoicePayment(
  invoice: InvoicePaymentDetails,
  suppliers: TrustedSupplier[],
  ownerId: string,
): VerificationResult {
  const checkedAt = new Date().toISOString();
  const supplierName = invoice.supplierName.trim() || "Unknown supplier";
  const scopedSuppliers = suppliers.filter((supplier) => supplier.ownerId === ownerId);
  const trusted = scopedSuppliers.find(
    (supplier) => normalizeSupplierName(supplier.name) === normalizeSupplierName(invoice.supplierName),
  );

  if (validateInvoicePaymentDetails(invoice).length > 0) {
    return {
      status: "REVIEW_REQUIRED",
      title: "Incomplete invoice details",
      explanation: "Payment details are incomplete or malformed — manual verification required.",
      supplierId: trusted?.id,
      supplierName,
      checkedAt,
    };
  }

  if (!trusted) {
    return {
      status: "REVIEW_REQUIRED",
      title: "New supplier",
      explanation: "New supplier — manual verification required.",
      supplierName,
      invoiceMaskedAccount: maskAccount(invoice.bankAccountNumber),
      checkedAt,
    };
  }

  const accountMatches = normalizeBankAccount(trusted.bankAccountNumber) === normalizeBankAccount(invoice.bankAccountNumber);
  const ifscMatches = normalizeIfsc(trusted.ifsc) === normalizeIfsc(invoice.ifsc);
  const upiMatches = optionalIdentifierMatches(trusted.upiId, invoice.upiId);
  if (!trusted.verified || !accountMatches || !ifscMatches || !upiMatches) {
    return {
      status: "HIGH_RISK",
      title: "Bank details changed",
      explanation: "BANK DETAILS CHANGED — payment details differ from trusted records.",
      supplierId: trusted.id,
      supplierName: trusted.name,
      previousMaskedAccount: maskAccount(trusted.bankAccountNumber),
      invoiceMaskedAccount: maskAccount(invoice.bankAccountNumber),
      checkedAt,
    };
  }

  return {
    status: "LOW_RISK",
    title: "Supplier verified",
    explanation: "Supplier verified — payment details match trusted records.",
    supplierId: trusted.id,
    supplierName: trusted.name,
    previousMaskedAccount: maskAccount(trusted.bankAccountNumber),
    invoiceMaskedAccount: maskAccount(invoice.bankAccountNumber),
    checkedAt,
  };
}
