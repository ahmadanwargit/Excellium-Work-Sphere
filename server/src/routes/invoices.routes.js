import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, formatInvoice, isManager } from '../services/records.service.js';
import { currentIso, nextSequenceId } from '../utils/ids.js';
import { conflict, notFound } from '../utils/http-error.js';

const invoiceSchema = z.object({
  month: z.string().trim().min(1).max(50),
  amount: z.number().positive().max(1_000_000),
  paymentDetails: z.string().trim().max(250).optional().default(''),
  documentName: z.string().trim().max(250).nullable().optional().default(null)
});

const decisionSchema = z.object({ status: z.enum(['Approved', 'Rejected']) });

export function createInvoicesRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', (request, response) => {
    const data = request.app.locals.store.data;
    const invoices = (isManager(request.auth.user) ? data.invoices : data.invoices.filter((invoice) => invoice.employeeId === request.auth.user.id))
      .map((invoice) => formatInvoice(data, invoice));
    response.json({ invoices });
  });

  router.post('/', validate(invoiceSchema), async (request, response, next) => {
    try {
      let invoice;
      await request.app.locals.store.mutate((data) => {
        invoice = {
          id: nextSequenceId(data.invoices, 'INV'),
          employeeId: request.auth.user.id,
          ...request.validated,
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
      next(error);
    }
  });

  router.patch('/:invoiceId', requireManagement, validate(decisionSchema), async (request, response, next) => {
    try {
      let invoice;
      await request.app.locals.store.mutate((data) => {
        invoice = data.invoices.find((item) => item.id === request.params.invoiceId);
        if (!invoice) throw notFound('Invoice not found');
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
