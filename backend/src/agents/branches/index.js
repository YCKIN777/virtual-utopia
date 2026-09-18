import { aheAgent } from './ahe.js';
import { fengheAgent } from './fenghe.js';
import { suianAgent } from './suian.js';
import { xubaiAgent } from './xubai.js';
import { zhiyuAgent } from './zhiyu.js';

export const branchAgents = Object.freeze({
  ahe: aheAgent,
  zhiyu: zhiyuAgent,
  xubai: xubaiAgent,
  suian: suianAgent,
  fenghe: fengheAgent,
});
