import { expect, test } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';

// Each fixture tool initializes real stdio SDK processes and verifies the Windows owner ACL.
// Keep this chain bounded while allowing its measured startup overhead.
test.describe.configure({ timeout: 120000 });

function tool(name: string, args: unknown) {
  const credential = path.resolve('.local/v03-validation-data/browser/browser-agent.json');
  const python = process.env.VOWEDIT_PYTHON || path.resolve(process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python');
  const result = spawnSync(python, ['-m', 'backend.tests.mcp_call', credential, name], {
    input: JSON.stringify(args), encoding: 'utf8', timeout: 20000,
    env: {...process.env, PYTHON_DOTENV_DISABLED: '1'},
  });
  if (result.status !== 0) throw new Error('Real MCP stdio fixture failed: ' + result.stderr);
  const data = JSON.parse(result.stdout.trim());
  if (data.error) throw new Error(data.error.code);
  return data;
}

for (const width of [1440, 768, 390, 360]) {
  test(`MCP same draft proposal approval and report at ${width}`, async ({ page, context }) => {
    await page.setViewportSize({width, height: 1000});
    const draft = tool('vowedit_create_edit', {request_key: crypto.randomUUID()});
    expect(draft.status).toBe('awaiting_image');
    expect(draft.open_status).toBe('not_requested');
    await page.goto(draft.ui_url);
    await expect(page.getByRole('heading', {name: 'Recoverable editing draft'})).toBeVisible();
    const png = await (await page.request.get('/fixtures/original.png')).body();
    await page.getByLabel('Attach original image').setInputFiles({name: 'original.png', mimeType: 'image/png', buffer: png});
    await expect.poll(() => tool('vowedit_get_edit', {draft_id: draft.id}).revision).toBe(1);
    const saved = tool('vowedit_get_edit', {draft_id: draft.id});
    const w = saved.source_dimensions.width, h = saved.source_dimensions.height;
    const proposal = tool('vowedit_propose_contract', {draft_id: draft.id, expected_revision: saved.revision,
      request_key: crypto.randomUUID(), instruction: 'Change center to blue', change: {kind: 'rectangles', rectangles: [
        {x0: Math.floor(w*.4), y0: Math.floor(h*.4), x1: Math.floor(w*.6), y1: Math.floor(h*.6)}]},
      keep: [{label: 'Face', threshold: 98, mask: {kind:'rectangles', rectangles:[{x0:0,y0:0,x1:Math.floor(w*.2),y1:Math.floor(h*.2)}]}}]});
    expect(proposal.state).toBe('pending');
    expect(tool('vowedit_get_edit', {draft_id: draft.id}).contract).toBeNull();
    await expect(page.getByText('Proposed instruction: Change center to blue')).toBeVisible();
    await page.getByRole('button', {name:'Accept request', exact:true}).click();
    await expect.poll(() => tool('vowedit_get_edit', {draft_id:draft.id}).revision).toBe(2);
    // Fresh browser deep-link restores server-acked contract without relying on sessionStorage.
    const fresh = await context.browser()!.newContext();
    const recovery = await fresh.newPage(); await recovery.goto(draft.ui_url);
    await expect(recovery.getByRole('textbox', {name:'Original instruction'})).toHaveValue('Change center to blue');
    await fresh.close();
    const plan = tool('vowedit_get_edit', {draft_id:draft.id});
    tool('vowedit_request_action', {action:'generate',draft_id:draft.id, expected_revision:plan.revision,
      plan_fingerprint:plan.plan.fingerprint,provider:'mock',request_key:crypto.randomUUID()});
    await expect(page.getByRole('button',{name:'Confirm saved contract and generate three candidates'})).toBeEnabled();
    await page.getByRole('button',{name:'Confirm saved contract and generate three candidates'}).click();
    await expect(page).toHaveURL(/\/edit\/[0-9a-f-]+$/);
    const runId = page.url().split('/').pop()!;
    await expect.poll(() => tool('vowedit_get_run',{run_id:runId}).status).toBe('completed');
    const report = tool('vowedit_get_report',{run_id:runId});
    expect(report.candidates).toHaveLength(3); expect(report.report).toBeTruthy();
    await expect(page.getByLabel('Before after slider')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fs.mkdir(`.local/v03-evidence/${width}`,{recursive:true});
    await page.screenshot({path:`.local/v03-evidence/${width}/agent-result.png`,fullPage:true});
    if(width === 1440) {
      await page.getByRole('button',{name:'View Edit Receipt'}).click();
      await page.getByLabel('Your verdict').selectOption('pass');
      await page.getByLabel('Human notes').fill('Automated Mock browser review fixture');
      await page.getByRole('button',{name:'Save human review'}).click();
      await expect(page.getByRole('status')).toHaveText('Human review saved.');
      let snapshot=tool('vowedit_get_run',{run_id:runId});
      const candidate=snapshot.candidates.find((c:{evaluation:{eligible:boolean}})=>c.evaluation.eligible);
      tool('vowedit_request_action',{action:'adopt',run_id:runId,candidate_id:candidate.id,expected_selection_revision:snapshot.revision,decision_fingerprint:snapshot.decision_fingerprint,request_key:crypto.randomUUID()});
      await page.getByRole('button',{name:'Accept request',exact:true}).click();
      await expect.poll(()=>tool('vowedit_get_run',{run_id:runId}).adopted_candidate_id).toBe(candidate.id);
      snapshot=tool('vowedit_get_run',{run_id:runId});
      tool('vowedit_request_action',{action:'continue',run_id:runId,candidate_id:candidate.id,expected_selection_revision:snapshot.revision,decision_fingerprint:snapshot.decision_fingerprint,request_key:crypto.randomUUID()});
      await page.getByRole('button',{name:'Accept request',exact:true}).click();
      await expect(page).toHaveURL(/\/drafts\/[0-9a-f-]+$/);
      const child=tool('vowedit_get_edit',{draft_id:page.url().split('/').pop()});
      expect(child.contract).toBeNull();expect(child.strokes).toEqual([]);
      expect(tool('vowedit_get_run',{run_id:runId}).candidates.find((c:{id:string})=>c.id===candidate.id).manual_review.verdict).toBe('pass');
    }
    if(width === 360) {
      await page.getByRole('button',{name:'Interface language'}).click();
      await expect(page.getByLabel('前后比较滑块')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
  });
}

test('rejected Agent proposal has no batch', async ({page}) => {
  const draft = tool('vowedit_create_edit',{request_key:crypto.randomUUID()});
  await page.goto(draft.ui_url);
  const png = await (await page.request.get('/fixtures/original.png')).body();
  await page.getByLabel('Attach original image').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:png});
  await expect.poll(() => tool('vowedit_get_edit',{draft_id:draft.id}).revision).toBe(1);
  tool('vowedit_propose_contract',{draft_id:draft.id,expected_revision:1,request_key:crypto.randomUUID(),
    instruction:'Paint center blue',change:{kind:'rectangles',rectangles:[{x0:10,y0:10,x1:30,y1:30}]}});
  await page.getByRole('button',{name:'Reject request',exact:true}).click();
  await expect.poll(() => tool('vowedit_get_edit',{draft_id:draft.id}).pending_requests[0].state).toBe('rejected');
  expect(tool('vowedit_get_edit',{draft_id:draft.id}).submitted_run_id).toBeNull();
});


test('human paint takeover, conflict and lost save acknowledgement recover', async ({page, context}) => {
  const pageErrors:string[]=[]; page.on('pageerror',error=>pageErrors.push(error.message));
  await page.route('**/api/config',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'SERVICE_UNAVAILABLE'}})}));
  const draft=tool('vowedit_create_edit',{request_key:crypto.randomUUID()});
  await page.goto(draft.ui_url);
  const png=await (await page.request.get('/fixtures/original.png')).body();
  await expect(page.locator('main p[role="alert"]')).toBeVisible();
  await page.unroute('**/api/config');
  let failedUploads=0;
  await page.route('**/api/assets?kind=original',route=>{failedUploads++;return route.abort('failed');});
  await page.getByLabel('Attach original image').setInputFiles({name:'failed-upload.png',mimeType:'image/png',buffer:png});
  await expect.poll(()=>failedUploads).toBe(1);
  await expect(page.locator('main p[role="alert"]')).toBeVisible();
  await expect(page.getByLabel('Attach original image')).toBeEnabled();
  expect(tool('vowedit_get_edit',{draft_id:draft.id}).source_asset_id).toBeNull();
  await page.unroute('**/api/assets?kind=original');
  await page.getByLabel('Attach original image').setInputFiles({name:'original.png',mimeType:'image/png',buffer:png});
  await expect.poll(()=>tool('vowedit_get_edit',{draft_id:draft.id}).revision).toBe(1);
  tool('vowedit_propose_contract',{draft_id:draft.id,expected_revision:1,request_key:crypto.randomUUID(),instruction:'Paint center blue',change:{kind:'rectangles',rectangles:[{x0:100,y0:100,x1:160,y1:160}]}});
  await page.getByRole('button',{name:'Accept request',exact:true}).click();
  await expect.poll(()=>tool('vowedit_get_edit',{draft_id:draft.id}).revision).toBe(2);
  const saved=tool('vowedit_get_edit',{draft_id:draft.id});
  tool('vowedit_request_action',{action:'generate',draft_id:draft.id,expected_revision:2,plan_fingerprint:saved.plan.fingerprint,provider:'mock',request_key:crypto.randomUUID()});
  await page.getByRole('button',{name:'Paint or refine boundaries'}).click();
  await page.getByText('Keyboard painting',{exact:true}).click();
  await page.getByRole('button',{name:'Add brush dab'}).click();
  await page.getByRole('button',{name:'Review edit contract'}).click();
  await expect.poll(()=>tool('vowedit_get_edit',{draft_id:draft.id}).revision).toBe(3);
  expect(tool('vowedit_get_edit',{draft_id:draft.id}).pending_requests.find((a:{action:string;state:string})=>a.action==='generate').state).toBe('stale');
  expect(tool('vowedit_get_edit',{draft_id:draft.id}).submitted_run_id).toBeNull();
  const second=await context.newPage();await second.goto(draft.ui_url);
  await second.getByRole('textbox',{name:'Original instruction'}).fill('Unacknowledged local edits');
  await page.getByRole('textbox',{name:'Original instruction'}).fill('Human revised center blue');
  await page.route('**/api/editing-drafts/'+draft.id,async route=>{if(route.request().method()==='PUT'){await route.fetch();await route.abort('failed');await page.unroute('**/api/editing-drafts/'+draft.id);}else await route.continue();});
  await page.getByRole('button',{name:'Save contract',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry pending save'})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Provider',exact:true})).toBeDisabled();
  await expect(page.getByRole('spinbutton',{name:'Background threshold',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Paint or refine boundaries'})).toBeDisabled();
  const pendingSave=await page.evaluate(id=>sessionStorage.getItem('vowedit.draft-save:'+id),draft.id);
  expect(pendingSave).toBeTruthy();
  let failedReloads=0;
  await page.route('**/api/agent/editing-drafts/'+draft.id,route=>{failedReloads++;return route.abort('failed');});
  await page.getByRole('button',{name:'Reload and discard local edits',exact:true}).first().click();
  await expect.poll(()=>failedReloads).toBeGreaterThan(0);
  await expect(page.getByRole('button',{name:'Reload and discard local edits',exact:true}).first()).toBeEnabled();
  await expect(page.locator('main p[role="alert"]')).toBeVisible();
  expect(await page.evaluate(id=>sessionStorage.getItem('vowedit.draft-save:'+id),draft.id)).toBe(pendingSave);
  await expect(page.getByRole('button',{name:'Retry pending save'})).toBeVisible();
  await page.unroute('**/api/agent/editing-drafts/'+draft.id);
  await page.getByRole('button',{name:'Retry pending save'}).click();
  await expect(page.getByRole('button',{name:'Retry pending save'})).toHaveCount(0);
  await expect.poll(()=>tool('vowedit_get_edit',{draft_id:draft.id}).revision).toBe(4);
  await expect(second.getByText('Saved state changed. Local edits are preserved; reload discards them.')).toBeVisible();
  await expect(second.getByRole('textbox',{name:'Original instruction'})).toHaveValue('Unacknowledged local edits');
  await second.getByRole('button',{name:'Reload and discard local edits'}).click();
  await expect(second.getByRole('textbox',{name:'Original instruction'})).toHaveValue('Human revised center blue');
  await second.close();
  await page.getByRole('button',{name:'Review generation',exact:true}).click();
  await expect(page.getByText('Your request: generate')).toBeVisible();
  await page.getByRole('button',{name:'Reject request',exact:true}).click();
  expect(tool('vowedit_get_edit',{draft_id:draft.id}).submitted_run_id).toBeNull();
  expect(pageErrors).toEqual([]);
});
