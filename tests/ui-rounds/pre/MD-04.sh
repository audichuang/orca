#!/usr/bin/env bash
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/env.sh"
. "$(dirname "${BASH_SOURCE[0]}")/ed-lib.sh"
# MD-02 的狀態 + 從 Bash 端用 CDP 呼叫 window.api.git.diff,結果寫到 md04-result.json 給 lcu 讀
ed_reset
: > "$P/WebApp/src/empty-new.ts"; : > "$P/docs-site/index.md"
sleep 2
rm -f "$OT/md04-result.json"
node --input-type=module - "$OT/md04-result.json" "$CDP_PORT" <<'JS'
import fs from 'node:fs';
const [out, port] = process.argv.slice(2);
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pages = targets.filter((t) => t.type === 'page' && /^http:\/\/localhost/.test(t.url));
if (pages.length !== 1) throw new Error('Ambiguous app target: ' + pages.length);
const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const expression = `(async()=>{
  if(!window.api||!window.api.git||!window.api.git.diff) return 'NO_API';
  const W='${process.env.ORCA_UI_ROOT || process.env.HOME + "/orca-ui-test"}/MultiProduct';
  const r=async(p,f,s)=>{try{const d=await window.api.git.diff({worktreePath:p,filePath:f,staged:s});return [f,s,d.kind,JSON.stringify(d.missingSides)??null]}catch(e){return [f,s,'ERR',String(e)]}};
  return await Promise.all([r(W+'/WebApp','src/components/new/Widget.tsx',false),r(W+'/WebApp','src/deleted-unstaged.ts',false),r(W+'/WebApp','src/deleted-staged.ts',true),r(W+'/WebApp','src/empty-new.ts',false),r(W+'/docs-site','index.md',false),r(W+'/WebApp','src/unstaged-mod.ts',false),r(W,'WebApp/src/unstaged-mod.ts',false)]);
})()`;
const res = await new Promise((resolve, reject) => {
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id === 1) m.error ? reject(m.error) : resolve(m.result); });
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
});
ws.close();
fs.writeFileSync(out, JSON.stringify(res.result));
JS
