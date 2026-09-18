import { branchAgents } from './branches/index.js';

const AGENT_BY_SCENE = Object.freeze(
  Object.values(branchAgents).reduce((registry, agent) => {
    agent.sceneIds.forEach((sceneId) => {
      registry[sceneId] = agent;
    });

    return registry;
  }, {}),
);

export const getBranchAgentForScene = (sceneId) => AGENT_BY_SCENE[sceneId];

export const listBranchAgents = () =>
  Object.values(branchAgents).map((agent) => ({
    id: agent.id,
    name: agent.name,
    sceneIds: [...agent.sceneIds],
  }));
