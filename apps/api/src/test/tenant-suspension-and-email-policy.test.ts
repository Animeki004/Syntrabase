import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../server.js';
import { AuthService } from '../services/auth.service.js';
import { PlanService } from '../services/plan.service.js';
import { EmailService } from '../services/email.service.js';
import { ProjectService } from '../services/project.service.js';
import { query } from '../db/pool.js';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

const devId = '00000000-0000-0000-0000-000000000001';
const superAdminToken = jwt.sign(
  { uid: devId, email: 'dev@syntrabase.internal', isPlatformAdmin: true },
  config.jwt.secret,
  { expiresIn: 900 }
);
const superAdminHeaders = { authorization: `Bearer ${superAdminToken}` };

test.before(async () => {
  try {
    await query(
      `INSERT INTO auth_sessions (id, user_id, refresh_token_hash, expires_at)
       VALUES ('00000000-0000-0000-0000-000000000099', '${devId}', 'mock_refresh_hash_test', NOW() + INTERVAL '1 day')
       ON CONFLICT (id) DO UPDATE SET revoked_at = NULL, expires_at = NOW() + INTERVAL '1 day'`
    );
    // Clean up temporary test projects for this test suite
    await query(
      `DELETE FROM projects WHERE slug LIKE '%suspension%' OR slug LIKE '%project-to-delete%'`
    );
  } catch (err) {
    console.warn('Could not seed auth session in test:', err);
  }
});

test('Super Admin - Email Platform Delivery Policy supports expanded controls', async () => {
  const server = await buildServer();

  // 1. Fetch policy
  const getRes = await server.inject({
    method: 'GET',
    url: '/api/v1/admin/email/policy',
    headers: superAdminHeaders,
  });
  assert.equal(getRes.statusCode, 200);
  const data = JSON.parse(getRes.body);
  const currentPolicy = data.policy;
  assert.ok(typeof currentPolicy.dailyProjectCap === 'number');
  assert.ok(typeof currentPolicy.monthlyProjectCap === 'number');
  assert.ok(typeof currentPolicy.burstRateLimitPerMinute === 'number');
  assert.ok(['throttle_and_queue', 'reject'].includes(currentPolicy.enforcementAction));
  assert.ok(typeof currentPolicy.allowedDomainsPerProject === 'number');
  assert.ok(typeof currentPolicy.requireEmailVerification === 'boolean');

  // 2. Update policy with new parameters
  const updateRes = await server.inject({
    method: 'PATCH',
    url: '/api/v1/admin/email/policy',
    headers: superAdminHeaders,
    payload: {
      dailyProjectCap: 500,
      monthlyProjectCap: 15000,
      burstRateLimitPerMinute: 60,
      enforcementAction: 'reject',
      allowedDomainsPerProject: 5,
      requireEmailVerification: true,
    },
  });
  assert.equal(updateRes.statusCode, 200);
  const updatedData = JSON.parse(updateRes.body);
  const updatedPolicy = updatedData.policy;
  assert.equal(updatedPolicy.dailyProjectCap, 500);
  assert.equal(updatedPolicy.monthlyProjectCap, 15000);
  assert.equal(updatedPolicy.burstRateLimitPerMinute, 60);
  assert.equal(updatedPolicy.enforcementAction, 'reject');
  assert.equal(updatedPolicy.allowedDomainsPerProject, 5);
  assert.equal(updatedPolicy.requireEmailVerification, true);
});

test('Plan Service - Plans include email quotas and limits', async () => {
  const plans = await PlanService.getAllPlans();
  assert.ok(Array.isArray(plans));
  assert.ok(plans.length >= 3);

  const freePlan = plans.find((p) => p.slug === 'free');
  assert.ok(freePlan, 'Free plan should exist');
  assert.ok((freePlan.maxEmailsPerDay ?? 0) >= 10);
  assert.ok((freePlan.maxEmailsPerMonth ?? 0) >= 100);
  assert.ok(typeof freePlan.maxCustomDomains === 'number');
  assert.ok(typeof freePlan.maxDedicatedAccounts === 'number');
});

test('Tenant Suspension - Chokes out database, email, credentials, and app user auth with 403 PROJECT_SUSPENDED', async () => {
  const server = await buildServer();

  // 1. Create real project via ProjectService
  const createdProject = await ProjectService.createProject(devId, 'Suspension Choke Test');
  const testProjectId = createdProject.id;

  const appUserToken = AuthService.generateAccessToken({
    uid: 'test-app-user-1',
    email: 'user1@suspension-test.local',
    projectId: testProjectId,
    environmentId: 'default',
  });

  // Verify active project document write works
  const writeRes = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${testProjectId}/databases/(default)/documents/test_collection/doc1`,
    headers: { authorization: `Bearer ${appUserToken}` },
    payload: { data: { message: 'hello active' } },
  });
  assert.ok(writeRes.statusCode === 201 || writeRes.statusCode === 200);

  // 2. Suspend project
  await query(`UPDATE projects SET status = 'suspended' WHERE id = '${testProjectId}'`);

  // Document read should return 403 with code PROJECT_SUSPENDED
  const readResSuspended = await server.inject({
    method: 'GET',
    url: `/api/v1/projects/${testProjectId}/databases/(default)/documents/test_collection/doc1`,
    headers: { authorization: `Bearer ${appUserToken}` },
  });
  assert.equal(readResSuspended.statusCode, 403);
  const readBody = JSON.parse(readResSuspended.body);
  assert.equal(readBody.code, 'PROJECT_SUSPENDED');

  // Direct assertProjectNotSuspended check
  await assert.rejects(
    async () => {
      await ProjectService.assertProjectNotSuspended(testProjectId);
    },
    (err: any) => err.code === 'PROJECT_SUSPENDED' && err.statusCode === 403
  );

  // Email enqueue on suspended project should reject with PROJECT_SUSPENDED
  await assert.rejects(
    async () => {
      await EmailService.enqueueEmail({
        projectId: testProjectId,
        toEmail: 'user@example.com',
        fromEmail: 'noreply@syntrabase.internal',
        fromName: 'Syntrabase Admin',
        subject: 'Test Subject',
        html: '<p>Test</p>',
      });
    },
    (err: any) => err.message.includes('PROJECT_SUSPENDED')
  );

  // App User Auth endpoint (e.g. register) on suspended project should return 403 PROJECT_SUSPENDED
  const appAuthRes = await server.inject({
    method: 'POST',
    url: `/api/v1/projects/${testProjectId}/auth/register`,
    payload: {
      email: 'newuser@example.local',
      password: 'StrongPassword123!',
    },
  });
  assert.equal(appAuthRes.statusCode, 403);
  const appAuthBody = JSON.parse(appAuthRes.body);
  assert.equal(appAuthBody.code, 'PROJECT_SUSPENDED');

  // Metadata endpoint GET /api/v1/projects/:projectId MUST still respond (allowSuspended = true) so Console shows lockdown banner
  const metaRes = await server.inject({
    method: 'GET',
    url: `/api/v1/projects/${testProjectId}`,
    headers: superAdminHeaders,
  });
  assert.equal(metaRes.statusCode, 200);
  const metaData = JSON.parse(metaRes.body);
  assert.equal(metaData.project.status, 'suspended');

  // 3. Reactivate project
  await query(`UPDATE projects SET status = 'active' WHERE id = '${testProjectId}'`);

  const readResActive = await server.inject({
    method: 'GET',
    url: `/api/v1/projects/${testProjectId}/databases/(default)/documents/test_collection/doc1`,
    headers: { authorization: `Bearer ${appUserToken}` },
  });
  assert.ok(readResActive.statusCode === 200 || readResActive.statusCode === 404);

  // Clean up
  await ProjectService.deleteProject(devId, testProjectId, createdProject.name);
});

test('Project Deletion - Console users can delete non-default projects with exact confirmation', async () => {
  const server = await buildServer();

  // Create project to delete
  const createdProject = await ProjectService.createProject(devId, 'Project To Delete');
  const deleteProjectId = createdProject.id;

  // 1. Deletion without correct confirmation should fail (400)
  const failRes = await server.inject({
    method: 'DELETE',
    url: `/api/v1/projects/${deleteProjectId}`,
    headers: superAdminHeaders,
    payload: {
      confirmationName: 'wrong-name',
    },
  });
  assert.equal(failRes.statusCode, 400);

  // 2. Default project deletion should fail (403 Forbidden)
  const defaultProjRes = await server.inject({
    method: 'DELETE',
    url: '/api/v1/projects/00000000-0000-0000-0000-000000000020',
    headers: superAdminHeaders,
    payload: {
      confirmationName: 'Default Project',
    },
  });
  assert.equal(defaultProjRes.statusCode, 403);

  // 3. Exact confirmation match should succeed (200)
  const successRes = await server.inject({
    method: 'DELETE',
    url: `/api/v1/projects/${deleteProjectId}`,
    headers: superAdminHeaders,
    payload: {
      confirmationName: 'Project To Delete',
    },
  });
  assert.equal(successRes.statusCode, 200);
  const successData = JSON.parse(successRes.body);
  assert.equal(successData.success, true);
  assert.equal(successData.deletedProjectId, deleteProjectId);

  // Verify project is removed from database
  const checkRes = await query(`SELECT id FROM projects WHERE id = '${deleteProjectId}'`);
  assert.equal(checkRes.rows.length, 0);
});
