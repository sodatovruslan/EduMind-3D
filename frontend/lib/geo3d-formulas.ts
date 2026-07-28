/**
 * Зеркало backend/app/services/geo3d_engine.py — держим на клиенте для
 * мгновенного live-пересчета при движении слайдеров (без похода на сервер
 * на каждый тик). Авторитетное значение для Auto-Grader все равно считает
 * бэкенд при completion — эти формулы только для отклика UI.
 */
export type ShapeKind = "cube" | "sphere" | "cylinder" | "cone" | "pyramid";

export interface ShapeMetrics {
  area: number;
  volume: number;
}

function cubeMetrics(side: number): ShapeMetrics {
  return { area: 6 * side ** 2, volume: side ** 3 };
}

function sphereMetrics(radius: number): ShapeMetrics {
  return { area: 4 * Math.PI * radius ** 2, volume: (4 / 3) * Math.PI * radius ** 3 };
}

function cylinderMetrics(radius: number, height: number): ShapeMetrics {
  const lateral = 2 * Math.PI * radius * height;
  const bases = 2 * Math.PI * radius ** 2;
  return { area: lateral + bases, volume: Math.PI * radius ** 2 * height };
}

function coneMetrics(radius: number, height: number): ShapeMetrics {
  const slantHeight = Math.sqrt(radius ** 2 + height ** 2);
  return {
    area: Math.PI * radius * (radius + slantHeight),
    volume: (1 / 3) * Math.PI * radius ** 2 * height,
  };
}

function pyramidMetrics(baseSide: number, height: number): ShapeMetrics {
  const baseArea = baseSide ** 2;
  const slantHeight = Math.sqrt(height ** 2 + (baseSide / 2) ** 2);
  const lateralArea = 2 * baseSide * slantHeight;
  return { area: baseArea + lateralArea, volume: (1 / 3) * baseArea * height };
}

export function computeShapeMetrics(shape: ShapeKind, dimensions: Record<string, number>): ShapeMetrics {
  switch (shape) {
    case "cube":
      return cubeMetrics(dimensions.side);
    case "sphere":
      return sphereMetrics(dimensions.radius);
    case "cylinder":
      return cylinderMetrics(dimensions.radius, dimensions.height);
    case "cone":
      return coneMetrics(dimensions.radius, dimensions.height);
    case "pyramid":
      return pyramidMetrics(dimensions.base_side, dimensions.height);
  }
}
