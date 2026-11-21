#!/bin/bash
# lcu 的沙箱讀不到剪貼簿:這個背景程式把每次複製寫到 <root>/clip/(latest.txt、seq),lcu 端的 copyAndRead() 讀檔。
# 用 changeCount 判斷,內容相同的兩次複製也會各算一次。
# 用法:clipwatch.sh [root](預設 ORCA_UI_ROOT 或 ~/orca-ui-test),用 Bash 的 run_in_background 啟動;停止:kill "$(cat <root>/clip/pid)"
D="${1:-${ORCA_UI_ROOT:-$HOME/orca-ui-test}}/clip"; mkdir -p "$D"; echo $$ > "$D/pid"
exec osascript -l JavaScript - "$D" <<'JXA'
ObjC.import('AppKit');
function run(argv) {
  const dir = argv[0], pb = $.NSPasteboard.generalPasteboard;
  const write = (name, text) => $(text).writeToFileAtomicallyEncodingError(`${dir}/${name}`, true, $.NSUTF8StringEncoding, null);
  let last = -1, seq = 0;
  for (;;) {
    const cc = pb.changeCount;
    if (cc !== last) {
      const s = pb.stringForType($.NSPasteboardTypeString);
      write('latest.txt', s.isNil() ? '' : s.js);
      write('seq', String(++seq));
      last = cc;
    }
    delay(0.15);
  }
}
JXA
