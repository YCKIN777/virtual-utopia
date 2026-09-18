import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCENE_CATALOG,
  getSceneDefinition,
  isKnownScene,
  isSceneAgentEnabled,
} from '../src/config/scenes.js';

test('defines all map scenes with one unavailable scene', () => {
  assert.equal(Object.keys(SCENE_CATALOG).length, 6);
  assert.equal(isKnownScene('yard'), true);
  assert.equal(isKnownScene('unknown'), false);
  assert.equal(getSceneDefinition('resource-wall').name, '资源墙');
  assert.equal(getSceneDefinition('pavilion').name, '议事亭');
});

test('enables the five agent-backed scenes only', () => {
  assert.equal(isSceneAgentEnabled('yard'), true);
  assert.equal(isSceneAgentEnabled('resource-wall'), true);
  assert.equal(isSceneAgentEnabled('pavilion'), true);
  assert.equal(isSceneAgentEnabled('library'), true);
  assert.equal(isSceneAgentEnabled('cabin'), true);
  assert.equal(isSceneAgentEnabled('far-forest'), false);
});
