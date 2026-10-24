import sys,re
t=sys.stdin.buffer.read().decode('utf-8')
chars=len(t.encode('utf-16-le'))//2
lines=0 if not t else t.count('\n')+1
words=len([w for w in re.split(r'[ \t\n\x0b\x0c\r]+',t) if w])
tokens=words+sum(t.count(c) for c in ';,(){}[]')
print(f"{chars:,} chars · {lines:,} lines · {words:,} words · ~{tokens:,} tokens.")
