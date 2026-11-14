import test from 'node:test';
import assert from 'node:assert/strict';
import {makeRequest, readDecisions, redact, shouldHide, siteFromUrl, validateCandidates, publicSettings, DEFAULTS, type Candidate} from '../src/core';
const candidate: Candidate = {id:'c1', tag:'div', classes:'sponsored', label:'Sponsored', text:'Try our service', width:300, height:250, linkHosts:['example.com'], signals:['advertising label']};
test('uses the documented Jev Noul contract', () => {
  const request = makeRequest('example.com', [candidate]);
  assert.equal(request.model, 'typesafe/jev-1.14');
  assert.equal(request.questions.c1.type, 'noul');
  assert.equal(request.state.hostname, 'example.com');
  assert.deepEqual(readDecisions({answers:{c1:{type:'noul',noul:.97}}}, [candidate]), [{id:'c1',probability:.97}]);
});
test('malformed or missing model answers fail closed', () => {
  for (const answer of [{}, {type:'noul',noul:'1'}, {type:'noul',noul:NaN}, {type:'noul',noul:1.2}, {type:'choice',noul:.98}, {type:'noul',noul:-1}]) assert.throws(() => readDecisions({answers:{c1:answer}}, [candidate]));
  assert.throws(() => readDecisions({}, [candidate]));
});
test('threshold respects uncertainty and rejects invalid probabilities', () => {
  assert.equal(shouldHide(.89, .9), false); assert.equal(shouldHide(.9, .9), true);
  assert.equal(shouldHide(NaN, .9), false); assert.equal(shouldHide(2, .9), false);
});
test('redacts email, URLs and long numeric identifiers before truncation', () => {
  const text = redact('Email me at private@example.com https://example.com/?secret=yes 4111 1111 1111 1111',180);
  assert.equal(text, 'Email me at [email] [link] [number]');
});
test('candidate validator rejects oversized batches, duplicate ids and unknown fields', () => {
  assert.throws(() => validateCandidates(new Array(13).fill(candidate)));
  assert.throws(() => validateCandidates([candidate,candidate]));
  assert.throws(() => validateCandidates([{...candidate,id:'__proto__'}]));
  assert.equal('cookies' in validateCandidates([{...candidate,cookies:'secret'}])[0],false);
  assert.equal(validateCandidates([{...candidate,text:'x'.repeat(300),linkHosts:['https://example.com/private','valid.com']}])[0].text.length,180);
  assert.deepEqual(validateCandidates([{...candidate,linkHosts:['https://example.com/private','valid.com']}])[0].linkHosts,['valid.com']);
});
test('only supported HTTP sites are accepted', () => {
  assert.equal(siteFromUrl('https://news.example.com/private?q=secret'),'news.example.com');
  for (const url of ['chrome://extensions','file:///tmp/a','javascript:alert(1)','not a url']) assert.equal(siteFromUrl(url),null);
});
test('public config does not expose the secret', () => {
  const config = publicSettings({...DEFAULTS, apiKey:'test-private-key'});
  assert.equal(config.hasKey,true); assert.equal('apiKey' in config,false); assert.equal(JSON.stringify(config).includes('test-private-key'),false);
});
