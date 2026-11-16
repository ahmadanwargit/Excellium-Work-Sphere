import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireManagement } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, formatAsset, formatEquipmentRequest, isManager } from '../services/records.service.js';
import { currentIso, nextSequenceId } from '../utils/ids.js';
import { conflict, notFound } from '../utils/http-error.js';

const requestSchema = z.object({
  item: z.string().trim().min(1).max(150),
  type: z.enum(['Replacement', 'Upgrade', 'Repair', 'Return']),
  reason: z.string().trim().min(1).max(1000)
});

const decisionSchema = z.object({ status: z.enum(['Approved', 'Rejected']) });

export function createEquipmentRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', (request, response) => {
    const data = request.app.locals.store.data;
    const requests = (isManager(request.auth.user) ? data.equipmentRequests : data.equipmentRequests.filter((item) => item.employeeId === request.auth.user.id))
      .map((item) => formatEquipmentRequest(data, item));
    const assets = (isManager(request.auth.user) ? data.assets : data.assets.filter((item) => item.assignedTo === request.auth.user.id))
      .map((asset) => formatAsset(data, asset));
    response.json({ assets, requests });
  });

  router.get('/requests', (request, response) => {
    const data = request.app.locals.store.data;
    const requests = (isManager(request.auth.user) ? data.equipmentRequests : data.equipmentRequests.filter((item) => item.employeeId === request.auth.user.id))
      .map((item) => formatEquipmentRequest(data, item));
    response.json({ requests });
  });

  router.post('/requests', validate(requestSchema), async (request, response, next) => {
    try {
      let equipmentRequest;
      await request.app.locals.store.mutate((data) => {
        equipmentRequest = {
          id: nextSequenceId(data.equipmentRequests, 'REQ'),
          employeeId: request.auth.user.id,
          ...request.validated,
          status: 'Pending',
          createdAt: currentIso(),
          decidedAt: null,
          decidedBy: null
        };
        data.equipmentRequests.unshift(equipmentRequest);
        addNotification(data, { audience: ['manager', 'admin'], message: `${request.auth.user.name} submitted equipment request ${equipmentRequest.id}` });
        addAuditEntry(data, request.auth.user.id, `Submitted equipment request ${equipmentRequest.id}`);
      });
      response.status(201).json({ request: formatEquipmentRequest(request.app.locals.store.data, equipmentRequest) });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/requests/:requestId', requireManagement, validate(decisionSchema), async (request, response, next) => {
    try {
      let equipmentRequest;
      await request.app.locals.store.mutate((data) => {
        equipmentRequest = data.equipmentRequests.find((item) => item.id === request.params.requestId);
        if (!equipmentRequest) throw notFound('Equipment request not found');
        if (equipmentRequest.status !== 'Pending') throw conflict('Only pending requests can be decided');
        equipmentRequest.status = request.validated.status;
        equipmentRequest.decidedAt = currentIso();
        equipmentRequest.decidedBy = request.auth.user.id;
        addNotification(data, { userId: equipmentRequest.employeeId, message: `Your equipment request ${equipmentRequest.id} was ${equipmentRequest.status.toLowerCase()}` });
        addAuditEntry(data, request.auth.user.id, `${equipmentRequest.status} ${equipmentRequest.id}`);
      });
      response.json({ request: formatEquipmentRequest(request.app.locals.store.data, equipmentRequest) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
