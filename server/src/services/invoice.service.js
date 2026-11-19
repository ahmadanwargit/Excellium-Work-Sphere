import { z } from 'zod';
import { HttpError } from '../utils/http-error.js';
import { dateOnlySchema } from '../utils/validation.js';

const lineItemsSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}, z.array(z.object({
  description: z.string().trim().min(1).max(250),
  quantity: z.coerce.number().positive().max(100_000).multipleOf(0.01),
  unitRate: z.coerce.number().min(0).max(1_000_000).multipleOf(0.01)
}).strict()).min(1).max(50).optional());

export const invoiceSchema = z.object({
  month: z.string().trim().min(1).max(50),
  amount: z.coerce.number().positive().max(1_000_000).optional(),
  lineItems: lineItemsSchema,
  taxRate: z.coerce.number().min(0).max(100).multipleOf(0.01).default(0),
  currency: z.enum(['USD', 'PKR', 'GBP', 'EUR', 'AED']).default('USD'),
  paymentDetails: z.string().trim().max(250).default(''),
  notes: z.string().trim().max(2000).default(''),
  dueDate: z.preprocess((value) => value === '' ? null : value, dateOnlySchema.nullable().default(null)),
  documentName: z.string().trim().max(250).nullable().default(null),
  status: z.enum(['Draft', 'Pending']).default('Pending')
}).strict().superRefine((value, context) => {
  if (!value.lineItems?.length && !value.amount) context.addIssue({ code: 'custom', path: ['lineItems'], message: 'Add an invoice line item or an amount' });
  if (!value.lineItems?.length && value.taxRate !== 0) context.addIssue({ code: 'custom', path: ['taxRate'], message: 'Line items are required to calculate tax' });
});

export function prepareInvoice(input) {
  const { amount: suppliedAmount, lineItems = [], ...fields } = input;
  const prepared = lineItems.map((item) => ({ ...item, amount: Math.round((item.quantity * item.unitRate + Number.EPSILON) * 100) / 100 }));
  const subtotalCents = prepared.length ? prepared.reduce((total, item) => total + Math.round(item.amount * 100), 0) : Math.round(suppliedAmount * 100);
  const taxCents = Math.round(subtotalCents * fields.taxRate / 100);
  const amount = (subtotalCents + taxCents) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new HttpError(400, 'Invoice total must be greater than zero and no more than 1,000,000');
  return { ...fields, lineItems: prepared, subtotal: subtotalCents / 100, taxAmount: taxCents / 100, amount };
}
