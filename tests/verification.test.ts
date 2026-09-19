import assert from "node:assert/strict";
import test from "node:test";
import {
  demoExtractionFixtures,
  demoInvoiceDocuments,
  demoTrustedSuppliers,
  DEMO_OWNER_ID,
  demoVerificationScenarios,
  InMemoryTrustedSupplierRepository,
} from "../domain/demo-data";
import { MockInvoiceExtractionAdapter, processInvoiceDocument } from "../domain/extraction";
import {
  normalizeSupplierName,
  validateInvoicePaymentDetails,
  verifyInvoicePayment,
  verifyInvoicePaymentFromRepository,
  type InvoicePaymentDetails,
} from "../domain/verification";

const scenario = (id: string) => {
  const found = demoVerificationScenarios.find((item) => item.id === id);
  assert.ok(found, `Missing demo scenario: ${id}`);
  return found.invoice;
};

test("existing supplier with matching details is LOW_RISK", () => {
  const result = verifyInvoicePayment(scenario("matching-details"), demoTrustedSuppliers, DEMO_OWNER_ID);
  assert.equal(result.status, "LOW_RISK");
  assert.match(result.explanation, /match trusted records/i);
  assert.equal(result.previousMaskedAccount, "•••• 7890");
});

test("changed bank account is HIGH_RISK", () => {
  const result = verifyInvoicePayment(scenario("changed-bank-details"), demoTrustedSuppliers, DEMO_OWNER_ID);
  assert.equal(result.status, "HIGH_RISK");
  assert.match(result.explanation, /BANK DETAILS CHANGED/);
  assert.equal(result.invoiceMaskedAccount, "•••• 6655");
});

test("changed IFSC is HIGH_RISK", () => {
  const invoice = { ...scenario("matching-details"), ifsc: "ICIC0005678" };
  const result = verifyInvoicePayment(invoice, demoTrustedSuppliers, DEMO_OWNER_ID);
  assert.equal(result.status, "HIGH_RISK");
});

test("changed UPI is HIGH_RISK", () => {
  const invoice = { ...scenario("matching-details"), upiId: "different@upi.demo" };
  const result = verifyInvoicePayment(invoice, demoTrustedSuppliers, DEMO_OWNER_ID);
  assert.equal(result.status, "HIGH_RISK");
});

test("new supplier is REVIEW_REQUIRED", () => {
  const result = verifyInvoicePayment(scenario("new-supplier"), demoTrustedSuppliers, DEMO_OWNER_ID);
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.match(result.explanation, /manual verification required/i);
});

test("supplier-name normalization handles capitalization, punctuation, and spacing", () => {
  assert.equal(normalizeSupplierName("  A.B.C.   TRADERS "), "abc traders");
  const invoice = { ...scenario("matching-details"), supplierName: " abc traders!!! " };
  assert.equal(verifyInvoicePayment(invoice, demoTrustedSuppliers, DEMO_OWNER_ID).status, "LOW_RISK");
});

test("malformed payment fields require review", () => {
  const malformed: InvoicePaymentDetails = {
    ...scenario("matching-details"),
    bankAccountNumber: "",
    ifsc: "not-an-ifsc",
    invoiceDate: "yesterday",
  };
  const result = verifyInvoicePayment(malformed, demoTrustedSuppliers, DEMO_OWNER_ID);
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.match(result.title, /Incomplete/);
});

test("different bank accounts never false-match", () => {
  const invoice = { ...scenario("matching-details"), bankAccountNumber: "001234567891" };
  const result = verifyInvoicePayment(invoice, demoTrustedSuppliers, DEMO_OWNER_ID);
  assert.equal(result.status, "HIGH_RISK");
});

test("supplier registry is owner-scoped", () => {
  const result = verifyInvoicePayment(scenario("matching-details"), demoTrustedSuppliers, "another-owner");
  assert.equal(result.status, "REVIEW_REQUIRED");
});

test("repository adapter supplies owner-scoped records to the engine", async () => {
  const repository = new InMemoryTrustedSupplierRepository(demoTrustedSuppliers);
  const result = await verifyInvoicePaymentFromRepository(scenario("matching-details"), repository, DEMO_OWNER_ID);
  assert.equal(result.status, "LOW_RISK");
});

test("duplicate trusted supplier records require review instead of low risk", () => {
  const duplicate = { ...demoTrustedSuppliers[0], id: "demo-supplier-abc-duplicate" };
  const result = verifyInvoicePayment(scenario("matching-details"), [...demoTrustedSuppliers, duplicate], DEMO_OWNER_ID);
  assert.equal(result.status, "REVIEW_REQUIRED");
  assert.equal(result.title, "Duplicate trusted records");
});

test("mock invoice pipeline produces all three demo outcomes", async () => {
  const adapter = new MockInvoiceExtractionAdapter(demoExtractionFixtures);
  const results = await Promise.all(
    demoInvoiceDocuments.map((document) => processInvoiceDocument(document, adapter, demoTrustedSuppliers, DEMO_OWNER_ID)),
  );
  assert.deepEqual(results.map((result) => result.verification.status), ["LOW_RISK", "HIGH_RISK", "REVIEW_REQUIRED"]);
  assert.equal(results[0].extraction?.invoiceNumber, "DEMO-1001");
  assert.match(results[1].verification.explanation, /BANK DETAILS CHANGED/);
});

test("missing supplier and bank details cannot produce LOW_RISK", async () => {
  const adapter = new MockInvoiceExtractionAdapter(new Map([
    ["missing-fields", { ...scenario("matching-details"), supplierName: "", bankAccountNumber: "" }],
  ]));
  const result = await processInvoiceDocument(
    { id: "missing-fields", fileName: "DEMO-missing-fields.pdf", contentType: "application/pdf" },
    adapter,
    demoTrustedSuppliers,
    DEMO_OWNER_ID,
  );
  assert.equal(result.verification.status, "REVIEW_REQUIRED");
  assert.ok(result.extractionIssues.some((issue) => issue.startsWith("supplierName:")));
  assert.ok(result.extractionIssues.some((issue) => issue.startsWith("bankAccountNumber:")));
});

test("malformed account, IFSC, and UPI values are rejected before lookup", () => {
  const invoice = {
    ...scenario("matching-details"),
    bankAccountNumber: "account-xyz",
    ifsc: "BAD",
    upiId: "not-a-upi",
  };
  const issues = validateInvoicePaymentDetails(invoice);
  assert.deepEqual(issues.map((issue) => issue.field), ["bankAccountNumber", "ifsc", "upiId"]);
  assert.equal(verifyInvoicePayment(invoice, demoTrustedSuppliers, DEMO_OWNER_ID).status, "REVIEW_REQUIRED");
});

test("pipeline extraction failure produces REVIEW_REQUIRED", async () => {
  const result = await processInvoiceDocument(
    { id: "unknown", fileName: "DEMO-unknown.pdf", contentType: "application/pdf" },
    new MockInvoiceExtractionAdapter(new Map()),
    demoTrustedSuppliers,
    DEMO_OWNER_ID,
  );
  assert.equal(result.verification.status, "REVIEW_REQUIRED");
  assert.equal(result.extraction, null);
});
