import { bundlePath } from './bundle-glsl'
import { edgeData, header, nodeData } from './shaders'

export const bundleVertex: string = `${header}${nodeData}${edgeData}${bundlePath}
in vec2 corner;
in uint instance;
out vec2 vPos;
flat out float vStart;
flat out float vEnd;
flat out float vHalfWidth;
flat out float vArrowLength;
flat out float vArrowHalf;
flat out float vHaloWidth;
flat out uint vDash;
flat out uint vArrow;
flat out vec4 vColor;
flat out float vOpacity;
flat out float vFlow;
void main() {
  ivec2 t = texel(instance);
  uvec4 topology = texelFetch(edgeTopology, t, 0);
  vec4 style = texelFetch(edgeStyle, t, 0);
  uint packed = topology.w;
  uint mask = texelFetch(edgeState, t, 0).r;
  bool highlighted = (mask & highlightMask) != 0u;
  uvec4 path = pathOf(instance);
  int count = int(path.y);
  if ((packed & 16u) == 0u || count < 2 || (overlay == 0 && (int(packed >> 5u) != layerSlot || highlighted))) {
    gl_Position = hidden;
    return;
  }
  Look look = resolve(mask, Look(style.y, style.x, 0.0, 1.0, none, topology.z, none, 0.0, none), 32);
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
  float start = nodeRadius(texelFetch(nodeStyle, s, 0));
  float end = total - nodeRadius(texelFetch(nodeStyle, e, 0));
  float visible = end - start;
  float width = max(look.strokeWidth, 0.5);
  uint arrow = (packed >> 2u) & 3u;
  float arrowLength = arrow != 0u && visible > width * 8.0 ? max(width * 4.0, 6.0) : 0.0;
  float arrowHalf = max(width * 1.6, 3.0);
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  float margin = 0.5 / pixelRatio + 0.25;
  float startHead = (arrow & 1u) != 0u ? arrowLength : 0.0;
  float endHead = (arrow & 2u) != 0u ? arrowLength : 0.0;
  float flow = edgeFlow(mask, style.w);
  uint dash = (packed & 3u) == 0u && flow != 0.0 ? 1u : packed & 3u;
  float body = (dash == 2u ? max(width * 0.6, 1.0) : width * 0.5) + halo + margin;
  float head = max(body, arrowHalf + halo + margin);
  bool wide = (startHead > 0.0 && float(previous) * spacing <= start + startHead)
    || (endHead > 0.0 && float(next) * spacing >= end - endHead);
  float across = corner.y * (wide ? head : body);
  vPos = vec2(float(k) * spacing, across);
  vStart = start;
  vEnd = end;
  vHalfWidth = width * 0.5;
  vArrowLength = arrowLength;
  vArrowHalf = arrowHalf;
  vHaloWidth = halo;
  vDash = dash;
  vFlow = flow * flowTime;
  vArrow = arrow;
  vColor = paletteColor(look.stroke);
  vOpacity = look.opacity;
  gl_Position = visible > 0.5 ? toClip(here + normal * across) : hidden;
}
`

export function bundleCorners(stations: number): Float32Array {
  const values = new Float32Array(stations * 4)
  for (let station = 0; station < stations; station++) {
    values.set([station, -1, station, 1], station * 4)
  }
  return values
}
