import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askJev, resolveConfig, validateAnswers } from '../dist/provider.js';
import { fixture, decision, KEY } from './helpers.mjs';
const questions = { action: { type: 'choice', instructions: 'Pick', criteria: { a: 'A', b: 'B' } }, goal: { type: 'noul', instructions: 'Done?' } };

test('endpoint and model defaults, explicit overrides, and legacy migration', () => {
  assert.equal(resolveConfig({ JEV_API_URL: 'https://openrouter.ai/api/alpha/decisions', JEV_API_KEY: KEY }).model, 'typesafe/jev-1.13');
  assert.equal(resolveConfig({ JEV_API_URL: 'https://api.typesafe.ai/v1/systemone', JEV_API_KEY: KEY }).model, 'jev-latest');
  assert.equal(resolveConfig({ JEV_API_URL: 'https://proxy.example/decide', JEV_API_KEY: KEY, JEV_MODEL: 'custom' }).model, 'custom');
  for (const url of ['https://example.org', 'file:///test', 'https://user:pass@example.org/decide', 'https://example.org/a#b']) {
    assert.throws(() => resolveConfig({ JEV_API_URL: url, JEV_API_KEY: KEY }), /endpoint/);
  }
  assert.throws(() => resolveConfig({ OPENROUTER_API_KEY: KEY }), /Legacy/);
});
test('raw HTTP contract works for native and Decisions paths; missing usage is unknown', async () => {
  const f = await fixture(body => decision(body, 'a'));
  try {
    for (const path of ['/v1/systemone', '/api/alpha/decisions']) {
      const config = resolveConfig({ JEV_API_URL: f.origin + path, JEV_API_KEY: KEY });
      const result = await askJev({ task: 'Hello' }, questions, config);
      assert.equal(result.answers.action.choice, 'a');
      assert.equal(result.usage.input_tokens, null);
      assert.equal(f.calls.at(-1).url, path);
      assert.equal(f.calls.at(-1).authorization, `Bearer ${KEY}`);
      assert.deepEqual(f.calls.at(-1).body, { model: 'jev-latest', state: { task: 'Hello' }, questions });
    }
  } finally { await f.close(); }
});
test('invalid choices and probabilities are rejected before execution', () => {
  const valid = decision({ questions }, 'a').answers;
  for (const change of [a => a.action.choice = 'attack', a => a.action.probabilities.a = 2,
    a => a.action.confidence = -1, a => a.goal.noul = '1', a => delete a.action.probabilities.a,
    a => a.action.probabilities.unknown = 0.1, a => a.action.type = 'noul']) {
    const answers = structuredClone(valid); change(answers);
    assert.throws(() => validateAnswers(answers, questions), /invalid decision/);
  }
});
test('HTTP error bodies and redirect destinations never expose the key', async () => {
  const f = await fixture((_body, _req, res) => { res.statusCode = 401; res.end(KEY); });
  const config = { url: f.origin + '/api/decisions', key: KEY, model: 'jev-latest' };
  try {
    await assert.rejects(askJev({}, questions, config), e => e.message.includes('401') && !e.message.includes(KEY));
    f.setHandler((_body, _req, res) => { res.writeHead(302, { Location: f.origin + '/api/leaked' }); res.end(); });
    await assert.rejects(askJev({}, questions, config), /redirects are not followed/);
    assert.equal(f.calls.length, 2);
  } finally { await f.close(); }
});
