# Embed the trained symbol network in site/piano-scan-reader.js as 8-bit weights (base64).
import json, base64, numpy as np, re, sys
M = json.load(open(sys.argv[1])); path = sys.argv[2]
def q(a):
    a = np.array(a, np.float32); s = float(np.abs(a).max()) / 127 or 1e-6
    b = np.clip(np.round(a / s), -127, 127).astype(np.int8)
    return {'scale': round(s, 8), 'data': base64.b64encode(b.tobytes()).decode()}
W1 = np.array(M['W1']); W2 = np.array(M['W2'])
out = {'classes': M['classes'], 'D': W1.shape[0], 'H': W1.shape[1], 'W1': q(W1), 'b1': [round(x, 4) for x in M['b1']], 'W2': q(W2), 'b2': [round(x, 4) for x in M['b2']]}
js = 'window.PianoScanModel = ' + json.dumps(out, separators=(',', ':')) + ';\n'
src = open(path).read()
start = src.find('// @@model'); 
block = '// @@model (written by scripts/scan-reader/train.py; do not edit by hand)\n' + js
if start >= 0:
    end = src.find('\n', src.find('window.PianoScanModel', start)) + 1
    src = src[:start] + block + src[end:]
else:
    src = src.rstrip('\n') + '\n' + block
open(path, 'w').write(src)
print(len(js))
