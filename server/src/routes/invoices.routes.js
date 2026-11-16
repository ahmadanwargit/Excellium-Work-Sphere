import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { upload } from '../middleware/upload.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, formatInvoice, isManager } from '../services/records.service.js';
import { currentIso, nextSequenceId } from '../utils/ids.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';

const invoiceSchema = z.object({
  month: z.string().trim().min(1).max(50),
  amount: z.coerce.number().positive().max(1_000_000),
  paymentDetails: z.string().trim().max(250).optional().default(''),
  documentName: z.string().trim().max(250).nullable().optional().default(null)
});

const decisionSchema = z.object({ status: z.enum(['Approved', 'Rejected']) });

function findInvoice(data, invoiceId) {
  const invoice = data.invoices.find((item) => item.id === invoiceId);
  if (!invoice) throw notFound('Invoice not found');
  return invoice;
}

function canAccessInvoice(user, invoice) {
  if (invoice.employeeId !== user.id && !isManager(user)) throw forbidden('You cannot access this invoice document');
}

export function createInvoicesRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', (request, response) => {
    const data = request.app.locals.store.data;
    const invoices = (isManager(request.auth.user) ? data.invoices : data.invoices.filter((invoice) => invoice.employeeId === request.auth.user.id))
      .map((invoice) => formatInvoice(data, invoice));
    response.json({ invoices });
  });

  router.get('/:invoiceId/document', async (request, response, next) => {
    try {
      const invoice = findInvoice(request.app.locals.store.data, request.params.invoiceId);
      canAccessInvoice(request.auth.user, invoice);
      const signed = await request.app.locals.storage.createSignedUrl(invoice.document);
      response.json(signed);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', upload.single('document'), validate(invoiceSchema), async (request, response, next) => {
    let uploadedDocument;
    try {
      if (request.file) {
        uploadedDocument = await request.app.locals.storage.upload({
          file: request.file,
          kind: 'invoice',
          ownerId: request.auth.user.id
        });
      }

      let invoice;
      await request.app.locals.store.mutate((data) => {
        invoice = {
          id: nextSequenceId(data.invoices, 'INV'),
          employeeId: request.auth.user.id,
          ...request.validated,
          documentName: uploadedDocument?.originalName ?? request.validated.documentName,
          document: uploadedDocument ?? null,
          status: 'Pending',
          submittedAt: currentIso(),
          decidedAt: null,
          decidedBy: null
        };
        data.invoices.unshift(invoice);
        addNotification(data, { audience: ['manager', 'admin'], message: `Invoice ${invoice.id} is waiting for approval` });
        addAuditEntry(data, request.auth.user.id, `Submitted ${invoice.id}`);
      });
      response.status(201).json({ invoice: formatInvoice(request.app.locals.store.data, invoice) });
    } catch (error) {
      await request.app.locals.storage.remove(uploadedDocument);
      next(error);
    }
  });

  router.patch('/:invoiceId', requireManagement, validate(decisionSchema), async (request, response, next) => {
    try {
      let invoice;
      await request.app.locals.store.mutate((data) => {
        invoice = findInvoice(data, request.params.invoiceId);
        if (invoice.status !== 'Pending') throw conflict('Only pending invoices can be decided');
        invoice.status = request.validated.status;
        invoice.decidedAt = currentIso();
        invoice.decidedBy = request.auth.user.id;
        addNotification(data, { userId: invoice.employeeId, message: `Your invoice ${invoice.id} was ${invoice.status.toLowerCase()}` });
        addAuditEntry(data, request.auth.user.id, `${invoice.status} ${invoice.id}`);
      });
      response.json({ invoice: formatInvoice(request.app.locals.store.data, invoice) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
