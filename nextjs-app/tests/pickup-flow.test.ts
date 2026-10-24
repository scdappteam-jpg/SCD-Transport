import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const result=await require('./helpers/pickup-flow-fixture.cjs')();
for(const entry of result.cases) test(entry.name,()=>assert.equal(entry.result,'PASS',entry.detail));
