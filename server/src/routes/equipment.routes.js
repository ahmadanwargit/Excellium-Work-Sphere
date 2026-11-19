import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requirePermission } from '../middleware/auth.middleware.js';
import { canManagePerson, canReviewPerson, isAvailablePerson, isStaffRole } from '../../../shared/access-control.mjs';
import { equipmentView } from '../services/workspace-views.service.js';
import { upload } from '../middleware/upload.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { addAuditEntry, addNotification, findUser, formatEquipmentRequest, formatAsset } from '../services/records.service.js';
import { currentDateKey, currentIso, nextSequenceId } from '../utils/ids.js';
import { dateOnlySchema } from '../utils/validation.js';
import { conflict, forbidden, notFound } from '../utils/http-error.js';

const requestSchema = z.object({
  item: z.string().trim().min(1).max(150),
  type: z.enum(['Replacement', 'Upgrade', 'Repair', 'Return']),
  reason: z.string().trim().min(1).max(1000)
});

const decisionSchema = z.object({ status: z.enum(['Approved', 'Rejected']) });
const assetSchema = z.object({
  name: z.string().trim().min(1).max(150),
  type: z.string().trim().min(1).max(80),
  serialNumber: z.string().trim().min(1).max(100),
  assignedTo: z.string().trim().min(1).max(100).nullable(),
  issuedOn: dateOnlySchema.nullable(),
  status: z.enum(['In use', 'Available', 'In repair'])
}).strict().superRefine((value, context) => {
  if (value.assignedTo && (!value.issuedOn || value.issuedOn > currentDateKey())) context.addIssue({ code: 'custom', message: 'Assigned equipment needs a valid issue date, today or earlier', path: ['issuedOn'] });
  if (value.assignedTo && value.status === 'Available') context.addIssue({ code: 'custom', message: 'Assigned equipment cannot be available', path: ['status'] });
  if (!value.assignedTo && (value.status === 'In use' || value.issuedOn)) context.addIssue({ code: 'custom', message: 'Unassigned equipment cannot be in use or have a current issue date' });
});

function saveAsset(data, actor, input, id) {
  const asset = id ? data.assets.find((item) => item.id === id) : null;
  if (id && !asset) throw notFound('Equipment not found');
  if (asset?.assignedTo && !canManagePerson(actor, findUser(data, asset.assignedTo))) throw forbidden('You cannot change equipment assigned outside your staff scope');
  if (input.assignedTo) {
    const person = findUser(data, input.assignedTo);
    if (!isAvailablePerson(person) || !isStaffRole(person.role) || !canManagePerson(actor, person)) throw forbidden('Select an active employee or trainer within your staff scope');
  }
  if (data.assets.some((item) => item.id !== id && item.serialNumber.toLowerCase() === input.serialNumber.toLowerCase())) throw conflict('An asset with this serial number already exists');
  const previousOwner = asset?.assignedTo;
  const result = asset ?? { id: nextSequenceId(data.assets, 'AST') };
  Object.assign(result, input);
  if (!asset) data.assets.unshift(result);
  if (previousOwner && previousOwner !== input.assignedTo && isAvailablePerson(findUser(data, previousOwner))) addNotification(data, { userId: previousOwner, message: `Equipment ${result.name} (${result.serialNumber}) is no longer assigned to you.` });
  if (input.assignedTo) addNotification(data, { userId: input.assignedTo, message: `Your equipment assignment: ${result.name} · ${result.type} · SN ${result.serialNumber} · ${result.status} · issued ${result.issuedOn}.` });
  addAuditEntry(data, actor.id, `${asset ? 'Updated' : 'Added'} equipment ${result.id}: ${result.name} (${result.serialNumber}); assigned to ${input.assignedTo ? findUser(data, input.assignedTo).name : 'nobody'}; ${result.status}; issued ${result.issuedOn ?? '—'}`, { subjectUserId: input.assignedTo ?? previousOwner ?? actor.id, eventType: 'EQUIPMENT_ASSIGNMENT' });
  return result;
}

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

  router.post('/assets', requirePermission('assignEquipment'), validate(assetSchema), async (request, response, next) => {
    try {
      let asset;
      await request.app.locals.store.mutate((data) => { asset = saveAsset(data, request.auth.user, request.validated); });
      response.status(201).json({ asset: formatAsset(request.app.locals.store.data, asset) });
    } catch (error) { next(error); }
  });

  router.patch('/assets/:assetId', requirePermission('assignEquipment'), validate(assetSchema), async (request, response, next) => {
    try {
      let asset;
      await request.app.locals.store.mutate((data) => { asset = saveAsset(data, request.auth.user, request.validated, request.params.assetId); });
      response.json({ asset: formatAsset(request.app.locals.store.data, asset) });
    } catch (error) { next(error); }
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
