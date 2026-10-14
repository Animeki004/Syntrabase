import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CloudFunctionService } from '../services/cloud-function.service.js';
import { CreateCloudTriggerSchema } from '@syntrabase/schemas';

export const functionRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {
  // Register Cloud Function Trigger
  server.post('/api/v1/projects/:projectId/functions/triggers', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const environmentId = (req.headers['x-environment-id'] as string) || 'default';
    const body = CreateCloudTriggerSchema.parse(req.body);

    const trigger = await CloudFunctionService.registerTrigger(
      projectId,
      environmentId,
      body.name,
      body.collectionPath,
      body.eventType,
      body.endpointUrl,
      body.secretKey
    );

    return reply.status(201).send({ trigger });
  });

  // List Triggers for a project
  server.get('/api/v1/projects/:projectId/functions/triggers', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const triggers = await CloudFunctionService.listTriggers(projectId);
    return reply.send({ triggers });
  });
};
