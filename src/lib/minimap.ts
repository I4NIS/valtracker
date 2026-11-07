export type Point = { x: number; y: number };

export function rotatePoint(point: Point, rotation: number): Point {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: 1 - point.y, y: point.x };
    case 180:
      return { x: 1 - point.x, y: 1 - point.y };
    case 270:
      return { x: point.y, y: 1 - point.x };
    default:
      return point;
  }
}

export function rotationStyle(rotation: number) {
  return rotation ? { transform: `rotate(${rotation}deg)` } : undefined;
}
