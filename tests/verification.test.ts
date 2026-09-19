import assert from "node:assert/strict";
import test from "node:test";
import { demoTrustedSuppliers, DEMO_OWNER_ID, demoVerificationScenarios } from "../domain/demo-data";
import {
  normalizeSupplierName,
  verifyInvoicePayment,
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
