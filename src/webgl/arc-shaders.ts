import { arcStations } from '../core/geo-arc'
import { bundlePath } from './bundle-glsl'
import { edgeData, header, nodeData } from './shaders'

const last = arcStations - 1

export const arcVertex: string = `${header}${nodeData}${edgeData}${bundlePath}
uniform float arcPiece;
in vec2 corner;
in uint instance;
out vec2 vPos;
out float vClip;
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
float alongAt(float u, float c1, float c2, float c3, float c4) {
  float f = clamp(u, 0.0, 1.0) * 4.0;
  if (f <= 1.0) return c1 * f;
  if (f <= 2.0) return mix(c1, c2, f - 1.0);
  if (f <= 3.0) return mix(c2, c3, f - 2.0);
  return mix(c3, c4, f - 3.0);
}
void main() {
  ivec2 t = texel(instance);
  uvec4 topology = texelFetch(edgeTopology, t, 0);
  vec4 style = texelFetch(edgeStyle, t, 0);
  uint packed = topology.w;
  uint mask = texelFetch(edgeState, t, 0).r;
  bool highlighted = (mask & highlightMask) != 0u;
  if ((packed & 16u) == 0u || topology.x == topology.y || (overlay == 0 && (int(packed >> 6u) != layerSlot || highlighted)) || pathOf(instance).y > 1u) {
    gl_Position = hidden;
    return;
  }
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 a = texelFetch(nodePosition, s, 0).xy;
  vec2 d = texelFetch(nodePosition, e, 0).xy;
  bool geodesic = geodesicOf(packed);
  if (edgeRoute(a, d, geodesic) != 1) {
    gl_Position = hidden;
    return;
  }
  float shiftX = 0.0;
  if (arcPiece > 0.5) {
    float endX = a.x + wrapDelta(d.x - a.x) + globeInfo.x;
    if (globeInfo.z > 0.0 || !geodesic || (endX >= 0.0 && endX <= 512.0)) {
      gl_Position = hidden;
      return;
    }
    shiftX = endX > 512.0 ? -512.0 : 512.0;
  }
  Look look = resolve(mask, Look(style.y, style.x, 0.0, 1.0, none, topology.z, none, 0.0, none), 32);
  look.opacity *= edgeShown(t, topology);
  if (look.opacity <= 0.0) {
    gl_Position = hidden;
    return;
  }
  Arc arc = arcOf(a, d, style.z, geodesic, shiftX);
  float k0;
  float k1;
  float k2;
  float k3;
  float k4;
  vec2 s0 = arcScreen(arc, 0.0, k0);
  vec2 s1 = arcScreen(arc, 0.25, k1);
  vec2 s2 = arcScreen(arc, 0.5, k2);
  vec2 s3 = arcScreen(arc, 0.75, k3);
  vec2 s4 = arcScreen(arc, 1.0, k4);
  if (max(max(max(k0, k1), max(k2, k3)), k4) < 0.0) {
    gl_Position = hidden;
    return;
  }
  float c1 = distance(s0, s1);
  float c2 = c1 + distance(s1, s2);
  float c3 = c2 + distance(s2, s3);
  float total = c3 + distance(s3, s4);
  float width = max(look.strokeWidth, 0.5);
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  float margin = 0.5 / pixelRatio + 0.25;
  float arrowHalf = max(width * 1.6, 3.0);
  float pad = max(width * 0.5, arrowHalf) + halo + margin + total * 0.15;
  vec2 low = min(min(min(s0, s1), min(s2, s3)), s4) - pad;
  vec2 high = max(max(max(s0, s1), max(s2, s3)), s4) + pad;
  if (any(lessThan(high, vec2(0.0))) || any(greaterThan(low, viewport))) {
    gl_Position = hidden;
    return;
  }
  int k = int(corner.x + 0.5);
  float u = float(k) / ${last.toFixed(1)};
  float gap = 1.0 / ${last.toFixed(1)};
  float clip;
  float clipBefore;
  float clipAfter;
  vec2 here = arcScreen(arc, u, clip);
  vec2 tangent = arcScreen(arc, min(u + gap, 1.0), clipAfter) - arcScreen(arc, max(u - gap, 0.0), clipBefore);
  float tangentLength = length(tangent);
  vec2 dir = tangentLength > 0.0 ? tangent / tangentLength : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float along = alongAt(u, c1, c2, c3, total);
  float start = nodeRadius(texelFetch(nodeStyle, s, 0), scaleAt(a));
  float end = total - nodeRadius(texelFetch(nodeStyle, e, 0), scaleAt(d));
  float visible = end - start;
  uint arrow = (packed >> 2u) & 3u;
  float arrowLength = arrow != 0u && visible > width * 8.0 ? max(width * 4.0, 6.0) : 0.0;
  float startHead = (arrow & 1u) != 0u ? arrowLength : 0.0;
  float endHead = (arrow & 2u) != 0u ? arrowLength : 0.0;
  float flow = edgeFlow(mask, style.w);
  uint dash = (packed & 3u) == 0u && flow != 0.0 ? 1u : packed & 3u;
  float body = (dash == 2u ? max(width * 0.6, 1.0) : width * 0.5) + halo + margin;
  float head = max(body, arrowHalf + halo + margin);
  bool wide = (startHead > 0.0 && alongAt(u - gap, c1, c2, c3, total) <= start + startHead)
    || (endHead > 0.0 && alongAt(u + gap, c1, c2, c3, total) >= end - endHead);
  float across = corner.y * (wide ? head : body);
  vPos = vec2(along, across);
  vClip = clip;
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
