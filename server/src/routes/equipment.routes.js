import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requirePermission } from '../middleware/auth.middleware.js';
import { canManagePerson, canReviewPerson } from '../../../shared/access-control.mjs';
import { equipmentView } from '../services/workspace-views.service.js';
import { upload } from '../middleware/upload.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, findUser, formatEquipmentRequest } from '../services/records.service.js';
import { currentIso, nextSequenceId } from '../utils/ids.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';

const requestSchema = z.object({
  item: z.string().trim().min(1).max(150),
  type: z.enum(['Replacement', 'Upgrade', 'Repair', 'Return']),
  reason: z.string().trim().min(1).max(1000)
});

const decisionSchema = z.object({ status: z.enum(['Approved', 'Rejected']) });

function findEquipmentRequest(data, requestId) {
  const equipmentRequest = data.equipmentRequests.find((item) => item.id === requestId);
  if (!equipmentRequest) throw notFound('Equipment request not found');
  return equipmentRequest;
}

function canAccessEquipmentRequest(user, equipmentRequest, data) {
  if (equipmentRequest.employeeId !== user.id && !canManagePerson(user, findUser(data, equipmentRequest.employeeId))) throw forbidden('You cannot access this equipment attachment');
}

export function createEquipmentRouter() {
  const router = Router();
  router.use(requireAuthentication);

  router.get('/', (request, response) => {
    response.json(equipmentView(request.app.locals.store.data, request.auth.user));
  });

  router.get('/requests', (request, response) => {
    response.json({ requests: equipmentView(request.app.locals.store.data, request.auth.user).requests });
  });

  router.get('/requests/:requestId/attachment', async (request, response, next) => {
    try {
      const equipmentRequest = findEquipmentRequest(request.app.locals.store.data, request.params.requestId);
      canAccessEquipmentRequest(request.auth.user, equipmentRequest, request.app.locals.store.data);
      const signed = await request.app.locals.storage.createSignedUrl(equipmentRequest.attachment);
      response.json(signed);
    } catch (error) {
      next(error);
    }
  });

  router.post('/requests', requirePermission('selfService'), upload.single('attachment'), validate(requestSchema), async (request, response, next) => {
    let uploadedAttachment;
    try {
      if (request.file) {
        uploadedAttachment = await request.app.locals.storage.upload({
          file: request.file,
          kind: 'equipment',
          owner: request.auth.user
        });
      }

      let equipmentRequest;
      await request.app.locals.store.mutate((data) => {
        equipmentRequest = {
          id: nextSequenceId(data.equipmentRequests, 'REQ'),
          employeeId: request.auth.user.id,
          ...request.validated,
          attachment: uploadedAttachment ?? null,
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
      await request.app.locals.storage.remove(uploadedAttachment);
      next(error);
    }
  });

  router.patch('/requests/:requestId', requirePermission('reviewEquipment'), validate(decisionSchema), async (request, response, next) => {
    try {
      let equipmentRequest;
      await request.app.locals.store.mutate((data) => {
        equipmentRequest = findEquipmentRequest(data, request.params.requestId);
        if (!canReviewPerson(request.auth.user, findUser(data, equipmentRequest.employeeId))) throw forbidden('You cannot decide your own request or a request outside your staff scope');
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
