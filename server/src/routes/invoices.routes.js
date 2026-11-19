import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, findUser, formatInvoice, isManager } from '../services/records.service.js';
import { invoiceSchema, prepareInvoice } from '../services/invoice.service.js';
import { createInvoicePdf } from '../services/invoice-pdf.service.js';
import { currentIso, nextSequenceId } from '../utils/ids.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';

const decisionSchema = z.object({ status: z.enum(['Approved', 'Rejected']) }).strict();

function findInvoice(data, invoiceId) {
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw notFound('Invoice not found');
  return invoice;
}

function canAccessInvoice(user, invoice) {
  if (invoice.employeeId !== user.id && (!isManager(user) || invoice.status === 'Draft')) throw forbidden('You cannot access this invoice');
}

function requireOwnedDraft(user, invoice) {
  if (invoice.employeeId !== user.id) throw forbidden('You can only edit or submit your own invoice draft');
  if (invoice.status !== 'Draft') throw conflict('Only draft invoices can be edited or submitted');
}

function notifySubmission(data, actor, invoice) {
  addNotification(data, { audience: ['manager', 'admin'], message: `Invoice ${invoice.id} is waiting for approval` });
  addAuditEntry(data, actor.id, `Submitted ${invoice.id}`);
}

export function createInvoicesRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', (request, response) => {
    const data = request.app.locals.store.data;
    const user = request.auth.user;
    const invoices = data.invoices.filter((invoice) => invoice.employeeId === user.id || (isManager(user) && invoice.status !== 'Draft'))
      .map((invoice) => formatInvoice(data, invoice));
    response.json({ invoices });
  });

  router.get('/:invoiceId/pdf', async (request, response, next) => {
    try {
      const data = request.app.locals.store.data;
      const invoice = findInvoice(data, request.params.invoiceId);
      canAccessInvoice(request.auth.user, invoice);
      const pdf = await createInvoicePdf({ invoice, employee: findUser(data, invoice.employeeId), organization: data.organization });
      response.set('Cache-Control', 'private, no-store').type('application/pdf').attachment(`${invoice.id}.pdf`).send(pdf);
    } catch (error) { next(error); }
  });

  router.get('/:invoiceId/document', async (request, response, next) => {
    try {
      const invoice = findInvoice(request.app.locals.store.data, request.params.invoiceId);
      canAccessInvoice(request.auth.user, invoice);
      const signed = await request.app.locals.storage.createSignedUrl(invoice.document);
      response.json(signed);
    } catch (error) { next(error); }
  });

  router.post('/', upload.single('document'), validate(invoiceSchema), async (request, response, next) => {
    let uploadedDocument;
    try {
      const fields = prepareInvoice(request.validated);
      if (request.file) uploadedDocument = await request.app.locals.storage.upload({ file: request.file, kind: 'invoice', owner: request.auth.user });
      let invoice;
      await request.app.locals.store.mutate((data) => {
        const now = currentIso();
        invoice = {
          id: nextSequenceId(data.invoices, 'INV'), employeeId: request.auth.user.id, ...fields,
          documentName: uploadedDocument?.originalName ?? fields.documentName, document: uploadedDocument ?? null,
          createdAt: now, updatedAt: now, submittedAt: fields.status === 'Draft' ? null : now, decidedAt: null, decidedBy: null
        };
        data.invoices.unshift(invoice);
        if (invoice.status === 'Pending') notifySubmission(data, request.auth.user, invoice);
        else addAuditEntry(data, request.auth.user.id, `Prepared draft ${invoice.id}`);
      });
      response.status(201).json({ invoice: formatInvoice(request.app.locals.store.data, invoice) });
    } catch (error) {
      await request.app.locals.storage.remove(uploadedDocument);
      next(error);
    }
  });

  router.put('/:invoiceId/draft', upload.single('document'), validate(invoiceSchema), async (request, response, next) => {
    let uploadedDocument;
    try {
      requireOwnedDraft(request.auth.user, findInvoice(request.app.locals.store.data, request.params.invoiceId));
      const fields = prepareInvoice(request.validated);
      if (fields.status !== 'Draft') throw conflict('Save as a draft first, then submit it for approval');
      if (request.file) uploadedDocument = await request.app.locals.storage.upload({ file: request.file, kind: 'invoice', owner: request.auth.user });
      let invoice;
      let oldDocument;
      await request.app.locals.store.mutate((data) => {
        invoice = findInvoice(data, request.params.invoiceId);
        requireOwnedDraft(request.auth.user, invoice);
        oldDocument = invoice.document;
        Object.assign(invoice, fields, {
          document: uploadedDocument ?? oldDocument,
          documentName: uploadedDocument?.originalName ?? oldDocument?.originalName ?? fields.documentName,
          updatedAt: currentIso()
        });
        addAuditEntry(data, request.auth.user.id, `Updated draft ${invoice.id}`);
      });
      if (uploadedDocument && oldDocument) await request.app.locals.storage.remove(oldDocument);
      response.json({ invoice: formatInvoice(request.app.locals.store.data, invoice) });
    } catch (error) {
      await request.app.locals.storage.remove(uploadedDocument);
      next(error);
    }
  });

  router.post('/:invoiceId/submit', validate(z.object({}).strict()), async (request, response, next) => {
    try {
      let invoice;
      await request.app.locals.store.mutate((data) => {
        invoice = findInvoice(data, request.params.invoiceId);
        requireOwnedDraft(request.auth.user, invoice);
        invoice.status = 'Pending';
        invoice.submittedAt = currentIso();
        invoice.updatedAt = invoice.submittedAt;
        notifySubmission(data, request.auth.user, invoice);
      });
      response.json({ invoice: formatInvoice(request.app.locals.store.data, invoice) });
    } catch (error) { next(error); }
  });

  router.patch('/:invoiceId', requireManagement, validate(decisionSchema), async (request, response, next) => {
    try {
      let invoice;
      await request.app.locals.store.mutate((data) => {
        invoice = findInvoice(data, request.params.invoiceId);
        if (invoice.status !== 'Pending') throw conflict('Only pending invoices can be decided');
        invoice.status = request.validated.status;
        invoice.decidedAt = currentIso();
        invoice.updatedAt = invoice.decidedAt;
        invoice.decidedBy = request.auth.user.id;
        addNotification(data, { userId: invoice.employeeId, message: `Your invoice ${invoice.id} was ${invoice.status.toLowerCase()}` });
        addAuditEntry(data, request.auth.user.id, `${invoice.status} ${invoice.id}`);
      });
      response.json({ invoice: formatInvoice(request.app.locals.store.data, invoice) });
    } catch (error) { next(error); }
  });

  return router;
}
