import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const results=await require('./helpers/meeting-safety-fixture.cjs')();
for(const item of results.cases) test(item.name,()=>assert.equal(item.result,'PASS'));
