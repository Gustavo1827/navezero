const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Snapshot 73 integra Barulhento e Juiz sem recriar os sistemas de função/reunião', () => {
  assert.match(html, /btnNoisySection[^>]*>[\s\S]*?🔊 Barulhento/);
  assert.match(html, /btnJudgeSection[^>]*>[\s\S]*?👨‍⚖️ Juiz/);
  assert.match(html, /noisyDuration:\[5,15\].*noisyChance:\[0,100\].*noisyMax:\[0,15\].*noisyImpostorVisible:\[0,1\]/s);
  assert.match(html, /judgeChance:\[0,100\].*judgeMax:\[0,15\].*judgeTaskPct:\[0,100\]/s);
  assert.match(html, /function triggerNoisyAlert\(ch\)[\s\S]*?Snd\.noisyAlarm\(\)[\s\S]*?CFG\.noisyImpostorVisible/);
  assert.match(html, /function registerJudgeDecision\(ch,target\)[\s\S]*?M\.judge=\{judgeId:ch\.id,targetId:target\.id\}[\s\S]*?castVote\(ch\.id,target\.id\)/);
  assert.match(html, /O Juiz se pronunciou! 👨‍⚖️/);
  assert.match(server, /noisyDuration:\[5,15\].*judgeTaskPct:\[0,100\]/s);
});
