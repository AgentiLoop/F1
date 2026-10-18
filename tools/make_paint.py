#!/usr/bin/env python3
"""Generate a shared body-paint pattern for the test cars (stdlib only).

The PNG is grey around 50%: rb22.mjs overlays it on each car's paint colour, so lighter
greys lighten the paint and darker greys darken it. Pattern: a gradient (dark low, light
high in UV space) with soft, tileable mottling and metallic flake.

  python3 tools/make_paint.py [--size 1024] [--seed 1] [--out models/paint_test.png]
"""
import argparse, math, random, struct, zlib


def png(path, size, rows):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 0, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=1024)
    ap.add_argument('--seed', type=int, default=1)
    ap.add_argument('--out', default='models/paint_test.png')
    a = ap.parse_args()
    rnd, n = random.Random(a.seed), a.size
    # Tileable value noise: a periodic grid (the texture wraps), smoothstep-interpolated.
    g = 8
    grid = [[rnd.random() for _ in range(g)] for _ in range(g)]
    smooth = lambda t: t * t * (3 - 2 * t)
    rows = []
    for y in range(n):
        fy = y * g / n; y0 = int(fy); ty = smooth(fy - y0)
        r0, r1 = grid[y0 % g], grid[(y0 + 1) % g]
        grad = 0.5 + 0.18 * math.cos(2 * math.pi * y / n)  # periodic, so the seam matches
        row = bytearray(n)
        for x in range(n):
            fx = x * g / n; x0 = int(fx); tx = smooth(fx - x0)
            top = r0[x0 % g] + (r0[(x0 + 1) % g] - r0[x0 % g]) * tx
            bot = r1[x0 % g] + (r1[(x0 + 1) % g] - r1[x0 % g]) * tx
            v = grad + 0.12 * (top + (bot - top) * ty - 0.5) + rnd.gauss(0, 0.035)  # mottling + flake
            if rnd.random() < 0.004: v += 0.25  # sparkle
            row[x] = max(0, min(255, int(v * 255)))
        rows.append(row)
    png(a.out, n, rows)
    print(f'wrote {a.out} ({n}x{n}, seed {a.seed})')


if __name__ == '__main__':
    main()
