import type { Point, TextBox } from "../../shared/image-types";

type MaskOptions = {
  padding: number;
  dilation: number;
};

export function createMaskFromBoxes(
  width: number,
  height: number,
  boxes: TextBox[],
  options: MaskOptions,
): Uint8Array {
  const mask = new Uint8Array(width * height);

  for (const box of boxes) {
    if (box.polygon && box.polygon.length >= 3) {
      fillPolygon(mask, width, height, expandPolygon(box.polygon, options.padding));
      continue;
    }

    fillRect(mask, width, height, {
      x1: Math.floor(box.x - options.padding),
      y1: Math.floor(box.y - options.padding),
      x2: Math.ceil(box.x + box.width + options.padding),
      y2: Math.ceil(box.y + box.height + options.padding),
    });
  }

  return dilateMask(mask, width, height, options.dilation);
}

function fillRect(
  mask: Uint8Array,
  width: number,
  height: number,
  rect: { x1: number; y1: number; x2: number; y2: number },
) {
  const x1 = clamp(rect.x1, 0, width - 1);
  const y1 = clamp(rect.y1, 0, height - 1);
  const x2 = clamp(rect.x2, 0, width - 1);
  const y2 = clamp(rect.y2, 0, height - 1);

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      mask[y * width + x] = 255;
    }
  }
}

function fillPolygon(
  mask: Uint8Array,
  width: number,
  height: number,
  points: Point[],
) {
  const minY = clamp(
    Math.floor(Math.min(...points.map((point) => point.y))),
    0,
    height - 1,
  );
  const maxY = clamp(
    Math.ceil(Math.max(...points.map((point) => point.y))),
    0,
    height - 1,
  );

  for (let y = minY; y <= maxY; y++) {
    const intersections: number[] = [];

    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];

      if ((current.y <= y && next.y > y) || (next.y <= y && current.y > y)) {
        const x =
          current.x + ((y - current.y) * (next.x - current.x)) / (next.y - current.y);
        intersections.push(x);
      }
    }

    intersections.sort((a, b) => a - b);

    for (let i = 0; i < intersections.length; i += 2) {
      const x1 = clamp(Math.floor(intersections[i]), 0, width - 1);
      const x2 = clamp(Math.ceil(intersections[i + 1] ?? intersections[i]), 0, width - 1);

      for (let x = x1; x <= x2; x++) {
        mask[y * width + x] = 255;
      }
    }
  }
}

function expandPolygon(points: Point[], padding: number): Point[] {
  if (padding <= 0) return points;

  const center = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length,
    }),
    { x: 0, y: 0 },
  );

  return points.map((point) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const length = Math.hypot(dx, dy) || 1;

    return {
      x: point.x + (dx / length) * padding,
      y: point.y + (dy / length) * padding,
    };
  });
}

function dilateMask(
  input: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return input;

  const output = new Uint8Array(input.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let filled = false;

      for (let dy = -radius; dy <= radius && !filled; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;

          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          if (input[ny * width + nx] > 0) {
            filled = true;
            break;
          }
        }
      }

      output[y * width + x] = filled ? 255 : 0;
    }
  }

  return output;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
