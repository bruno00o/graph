import { bridgeData, pathBridges } from './bridge-glsl'
import { bundlePath } from './bundle-glsl'
import { edgeData, endData, header, nodeData } from './shaders'

export function bundleVertexOf(bridged: boolean): string {
  return `${header}${nodeData}${edgeData}${endData}${bundlePath}${bridged ? bridgeData : ''}
uniform sampler2D pathStations;
uniform float pathMeasured;
float stationOf(uvec4 path, int k, float total, float spacing) {
  if (pathMeasured < 0.5) return float(k) * spacing;
  vec2 station = texelFetch(pathStations, texel(path.x + uint(k)), 0).xy;
  return mix(station.x, station.y, bundleMix) * total;
}
layout(location = 0) in vec2 corner;
layout(location = 1) in uint instance;
out vec2 vPos;
flat out float vStart;
flat out float vEnd;
flat out float vHalfWidth;
flat out float vArrowLength;
flat out float vArrowHalf;
flat out float vHaloWidth;
flat out uint vDash;
flat out uint vArrow;
#ifdef ENDS
flat out uint vNear;
flat out uint vFar;
flat out vec3 vSplit;
#else
flat out vec4 vColor;
#endif
flat out float vOpacity;
flat out float vFlow;
void main() {
  ivec2 t = texel(instance);
  uvec4 topology = texelFetch(edgeTopology, t, 0);
  vec4 style = texelFetch(edgeStyle, t, 0);
  uint packed = topology.w;
  uint mask = texelFetch(edgeState, t, 0).r;
  bool highlighted = (mask & stateRaise.y) != 0u;
  uvec4 path = pathOf(instance);
  int count = int(path.y);
  if ((packed & 16u) == 0u || count < 2 || (overlay == 0 && (int(packed >> 6u) != layerSlot || highlighted))) {
    gl_Position = hidden;
    return;
  }
  Look look = lineLook(mask, style);
  look.opacity *= edgeShown(t, topology);
  if (look.opacity <= 0.0) {
    gl_Position = hidden;
    return;
  }
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 a = texelFetch(nodePosition, s, 0).xy;
  vec2 d = texelFetch(nodePosition, e, 0).xy;
  int k = min(int(corner.x + 0.5), count - 1);
  int previous = max(k - 1, 0);
  int next = min(k + 1, count - 1);
  vec2 here = toScreen(pathPoint(path, k, a, d, style.z));
  vec2 tangent = toScreen(pathPoint(path, next, a, d, style.z)) - toScreen(pathPoint(path, previous, a, d, style.z));
  float tangentLength = length(tangent);
  vec2 dir = tangentLength > 0.0 ? tangent / tangentLength : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float total = pathLength(path) * zoom;
  float spacing = total / float(count - 1);
  float along = stationOf(path, k, total, spacing);
  float before = stationOf(path, previous, total, spacing);
  float after = stationOf(path, next, total, spacing);
  float start = nodeRadius(texelFetch(nodeStyle, s, 0), scaleAt(a));
  float end = total - nodeRadius(texelFetch(nodeStyle, e, 0), scaleAt(d));
  float visible = end - start;
  float flow = edgeFlow(mask, style.w);
  Line line = edgeLine(t, topology, style, look, flow);
  float width = max(line.width, line.farWidth);
  uint arrow = (packed >> 2u) & 3u;
  float arrowHalf = max(width * 1.6, 3.0);
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  float margin = 0.5 / pixelRatio + 0.25;
  float startHead = (arrow & 1u) != 0u && visible > line.width * 8.0 ? max(line.width * 4.0, 6.0) : 0.0;
  float endHead = (arrow & 2u) != 0u && visible > line.farWidth * 8.0 ? max(line.farWidth * 4.0, 6.0) : 0.0;
  bool dotted = line.dash == 2u || line.farDash == 2u;
  float body = (dotted ? max(width * 0.6, 1.0) : width * 0.5) + halo + margin;
  float head = max(body, arrowHalf + halo + margin);${bridged ? pathBridges : ''}
  bool wide = (startHead > 0.0 && before <= start + startHead)
    || (endHead > 0.0 && after >= end - endHead);
  float across = corner.y * (wide ? head : body);
  vPos = vec2(along, across);
  vStart = start;
  vEnd = end;
  vHalfWidth = line.width * 0.5;
  vArrowLength = (arrow & 1u) != 0u ? startHead : endHead;
  vArrowHalf = max(line.width * 1.6, 3.0);
  vHaloWidth = halo;
  vDash = line.dash | (line.farDash << 2u);
  vFlow = flow * flowTime;
  vArrow = arrow;
#ifdef ENDS
  vNear = packColor(paletteColor(line.color));
  vFar = line.farColor == line.color ? vNear : packColor(paletteColor(line.farColor));
  vSplit = splitOf(line, start, end, endHead);
#else
  vColor = paletteColor(line.color);
#endif
  vOpacity = look.opacity;
  gl_Position = visible > 0.5 ? toClip(here + normal * across) : hidden;
}
`
}

export const bundleVertex: string = bundleVertexOf(false)

export function bundleCorners(stations: number): Float32Array {
  const values = new Float32Array(stations * 4)
  for (let station = 0; station < stations; station++) {
    values.set([station, -1, station, 1], station * 4)
  }
  return values
}
