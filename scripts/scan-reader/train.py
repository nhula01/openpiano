import numpy as np, json, sys
rng = np.random.default_rng(0)
parts = [np.load(f, allow_pickle=True) for f in sys.argv[1:]]
X = np.concatenate([p['X'] for p in parts]); Y = np.concatenate([p['Y'] for p in parts])
MERGE = {'restW': 'hbar', 'restH': 'hbar', 'rest32': 'rest32', 'bar': 'other'}
Y = np.array([MERGE.get(y, y) for y in Y])
CLASSES = ['other','note','dot','curve','brace','clefG','clefF','clefC','sharp','flat','natural','dsharp','dflat','hbar','rest4','rest8','rest16','rest32'] + [f'ts{i}' for i in range(1, 10)] + ['tsC','tsCut','tup3','tup5','tup6']
keep = np.isin(Y, CLASSES); X = X[keep]; Y = Y[keep]
yi = np.array([CLASSES.index(y) for y in Y]); K = len(CLASSES); D = X.shape[1]
perm = rng.permutation(len(X)); nval = len(X) // 10
va, tr = perm[:nval], perm[nval:]
counts = np.bincount(yi[tr], minlength=K).astype(float)
cw = (counts.max() / np.maximum(counts, 1)) ** 0.5; cw = cw / cw[yi[tr]].mean()
H = 96
W1 = rng.normal(0, np.sqrt(2 / D), (D, H)).astype(np.float32); b1 = np.zeros(H, np.float32)
W2 = rng.normal(0, np.sqrt(2 / H), (H, K)).astype(np.float32); b2 = np.zeros(K, np.float32)
params = [W1, b1, W2, b2]; m = [np.zeros_like(p) for p in params]; v = [np.zeros_like(p) for p in params]
lr, t = 2e-3, 0
def fwd(x):
    h = np.maximum(0, x @ W1 + b1); z = h @ W2 + b2; z -= z.max(1, keepdims=True); p = np.exp(z); p /= p.sum(1, keepdims=True); return h, p
for ep in range(40):
    idx = rng.permutation(tr)
    # oversample rare classes
    rare = tr[cw[yi[tr]] > 3]
    idx = np.concatenate([idx, rng.choice(rare, len(rare) * 2)]) if len(rare) else idx
    idx = rng.permutation(idx)
    for s in range(0, len(idx), 256):
        bi = idx[s:s + 256]; x = X[bi] + rng.normal(0, 0.02, X[bi].shape).astype(np.float32); y = yi[bi]
        h, p = fwd(x); g = p.copy(); g[np.arange(len(y)), y] -= 1; g *= cw[y][:, None] / len(y)
        gW2 = h.T @ g; gb2 = g.sum(0); gh = g @ W2.T; gh[h <= 0] = 0; gW1 = x.T @ gh; gb1 = gh.sum(0)
        grads = [gW1 + 1e-4 * W1, gb1, gW2 + 1e-4 * W2, gb2]; t += 1
        for i, (pp, gg) in enumerate(zip(params, grads)):
            m[i] = 0.9 * m[i] + 0.1 * gg; v[i] = 0.999 * v[i] + 0.001 * gg * gg
            pp -= lr * (m[i] / (1 - 0.9 ** t)) / (np.sqrt(v[i] / (1 - 0.999 ** t)) + 1e-8)
    if ep in (25, 33): lr /= 3
    _, p = fwd(X[va]); pred = p.argmax(1); acc = (pred == yi[va]).mean()
    if ep % 5 == 4 or ep == 39: print(ep, 'val acc', round(acc, 4))
_, p = fwd(X[va]); pred = p.argmax(1)
for k in range(K):
    sel = yi[va] == k
    if sel.sum(): print(f'{CLASSES[k]:8s} n={sel.sum():5d} recall={(pred[sel] == k).mean():.3f} precision={((pred == k) & sel).sum() / max(1, (pred == k).sum()):.3f}')
json.dump({'classes': CLASSES, 'W1': np.round(W1, 4).tolist(), 'b1': np.round(b1, 4).tolist(), 'W2': np.round(W2, 4).tolist(), 'b2': np.round(b2, 4).tolist()}, open('model.json', 'w'))
