# python3 degrade.py in.png out.jpg kind seed
import sys, numpy as np, cv2
src, dst, kind, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
r = np.random.default_rng(seed)
im = cv2.imread(src, cv2.IMREAD_GRAYSCALE).astype(np.float32)
H, W = im.shape
def warp_rot(im, deg):
    M = cv2.getRotationMatrix2D((W / 2, H / 2), deg, 1.0)
    return cv2.warpAffine(im, M, (W, H), flags=cv2.INTER_LINEAR, borderValue=255)
if kind == 'clean':
    pass
elif kind == 'lite':
    if r.random() < 0.4: im = cv2.erode(im, np.ones((2, 2), np.uint8)) if r.random() < 0.5 else cv2.dilate(im, np.ones((2, 2), np.uint8))
    im = cv2.GaussianBlur(im, (0, 0), r.uniform(0.3, 1.0))
    paper = r.uniform(190, 250); ink = r.uniform(10, 70)
    im = ink + (im / 255) * (paper - ink)
    gx, gy = np.meshgrid(np.linspace(-1, 1, W), np.linspace(-1, 1, H))
    im = im * (1 - r.uniform(0, 0.25) * ((gx * r.uniform(-1, 1) + gy * r.uniform(-1, 1)) * 0.5 + 0.5))
    im += r.normal(0, r.uniform(1, 7), im.shape)
elif kind == 'scan':
    if r.random() < 0.5: im = cv2.erode(im, np.ones((2, 2), np.uint8)) if r.random() < 0.5 else cv2.dilate(im, np.ones((2, 2), np.uint8))
    im = warp_rot(im, r.uniform(-1.5, 1.5))
    im = cv2.GaussianBlur(im, (0, 0), r.uniform(0.3, 1.2))
    paper = r.uniform(215, 250); ink = r.uniform(10, 60)
    im = ink + (im / 255) * (paper - ink)
    im += r.normal(0, r.uniform(2, 10), im.shape)
elif kind == 'photo':
    # perspective
    d = 0.025 * min(W, H)
    pts1 = np.float32([[0, 0], [W, 0], [W, H], [0, H]])
    pts2 = pts1 + r.uniform(-d, d, (4, 2)).astype(np.float32)
    im = cv2.warpPerspective(im, cv2.getPerspectiveTransform(pts1, pts2), (W, H), flags=cv2.INTER_LINEAR, borderValue=255)
    # page curvature: vertical displacement varying smoothly with x (book spine bend)
    amp = r.uniform(0, 0.012) * H; xs = np.arange(W, dtype=np.float32); ys = np.arange(H, dtype=np.float32)
    dy = amp * np.sin(np.pi * xs / W + r.uniform(-0.5, 0.5))[None, :] * (0.5 + ys[:, None] / H)
    mapx = np.tile(xs, (H, 1)); mapy = ys[:, None] + dy - dy.mean()
    im = cv2.remap(im, mapx, mapy.astype(np.float32), cv2.INTER_LINEAR, borderValue=255)
    im = warp_rot(im, r.uniform(-4, 4))
    # lighting: smooth gradient + vignette, grey paper
    gx, gy = np.meshgrid(np.linspace(-1, 1, W), np.linspace(-1, 1, H))
    light = 1 - r.uniform(0.1, 0.35) * ((gx * r.uniform(-1, 1) + gy * r.uniform(-1, 1)) * 0.5 + 0.5) - r.uniform(0, 0.25) * (gx ** 2 + gy ** 2) / 2
    paper = r.uniform(170, 235); ink = r.uniform(25, 70)
    im = (ink + (im / 255) * (paper - ink)) * light
    im = cv2.GaussianBlur(im, (0, 0), r.uniform(0.4, 1.1))
    im += r.normal(0, r.uniform(2, 6), im.shape)
    s = r.uniform(0.75, 1.0); im = cv2.resize(im, (int(W * s), int(H * s)), interpolation=cv2.INTER_AREA)
im = np.clip(im, 0, 255).astype(np.uint8)
cv2.imwrite(dst, im, [cv2.IMWRITE_JPEG_QUALITY, int(r.uniform(55, 92))] if dst.endswith('.jpg') else [])
