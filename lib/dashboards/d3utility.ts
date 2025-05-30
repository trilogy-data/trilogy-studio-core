import type { Row } from '../editors/results'
interface ProjectionFactors {
  scaleFactor: number
  //   translateXFactor: number;
  //   translateYFactor: number;
}

export function computeMercatorProjectionFactors(
  data: readonly Row[],
  lonField: string = 'stop_longitude',
  latField: string = 'stop_latitude',
): ProjectionFactors {
  if (!data.length) throw new Error('No data points provided')

  const toRadians = (deg: number) => (deg * Math.PI) / 180
  const clampLat = (lat: number) => Math.max(-85.05113, Math.min(85.05113, lat))

  const mercator = (lon: number, lat: number): [number, number] => {
    const x = toRadians(lon)
    const y = Math.log(Math.tan(Math.PI / 4 + toRadians(clampLat(lat)) / 2))
    return [x, y]
  }

  const projected = data.map((d) => mercator(d[lonField], d[latField]))
  const xs = projected.map(([x]) => x)
  const ys = projected.map(([_, y]) => y)

  const xMin = Math.min(...xs),
    xMax = Math.max(...xs)
  const yMin = Math.min(...ys),
    yMax = Math.max(...ys)

  const dx = xMax - xMin
  const dy = yMax - yMin
  //   const centerX = (xMax + xMin) / 2;
  //   const centerY = (yMax + yMin) / 2;

  // Use the smaller dimension to ensure the map fits within bounds
  // Add padding factor (0.9) to leave some margin
  const scaleFactor = 0.9 / Math.max(dx, dy)

  return {
    scaleFactor,
    // translateXFactor: -centerX * scaleFactor + 0.5,
    // translateYFactor: -centerY * scaleFactor + 0.5,
  }
}
