import { header, spanData } from './shaders'

export const shapeStyleUnit = 21
export const shapeStateUnit = 22
export const shapeZoomUnit = 23
export const shapeTimeUnit = 24
export const shapeRanged = 1
export const shapeTimed = 2
export const shapeAlive = 0x1000000
export const shapeSkip = 0x80000000
export const shapePolygon = 0x40000000
export const shapeRect = 0x40000000
export const shapeIndexMask = 0x3fffffff

const shapeCommon = `
uniform usampler2D shapeStyle;
uniform usampler2D shapeState;
uniform sampler2D shapeZoom;
uniform sampler2D shapeTime;
uniform uint shapeFlags;
uniform uvec4 hiddenShapes;
uniform int shapePass;
const uint shapeIndexMask = ${shapeIndexMask}u;
${spanData}
struct ShapeLook { vec4 fill; vec4 stroke; float halfWidth; uint dash; };
vec4 shapePaint(uint id, float opacity) {
  if (id == none) return vec4(0.0);
  vec4 color = paletteColor(id);
  float alpha = color.a * opacity;
  return vec4(color.rgb * alpha, alpha);
}
ShapeLook shapeLook(uint index) {
  ivec2 t = texel(index);
  uvec4 style = texelFetch(shapeStyle, t, 0);
  ShapeLook result = ShapeLook(vec4(0.0), vec4(0.0), 0.0, style.w & 3u);
  if ((style.w & ${shapeAlive}u) == 0u) return result;
  uint mask = texelFetch(shapeState, t, 0).r;
  if (((mask & stateShapes.x) != 0u) != (shapePass == 1)) return result;
  if ((mask & stateShapes.y) != 0u || (~mask & stateShapes.w) != 0u) return result;
  if (anyHidden(hiddenShapes) && slotHidden(hiddenShapes, (style.w >> 16u) & 255u)) return result;
  float shown = (shapeFlags & ${shapeRanged}u) != 0u ? zoomShown(texelFetch(shapeZoom, t, 0).xy) : 1.0;
  if (timed > 0.5 && (shapeFlags & ${shapeTimed}u) != 0u && shown > 0.0) {
    shown *= timeShown(texelFetch(shapeTime, t, 0));
  }
  if (shown <= 0.0) return result;
  float opacity = float((style.w >> 8u) & 255u) / 255.0;
  Look look = resolve(mask, Look(opacity, uintBitsToFloat(style.z), 0.0, 0.0, style.x, style.y, none, 0.0, none), 128);
  float alpha = look.opacity * shown;
  result.halfWidth = max(look.strokeWidth, 0.0) * 0.5;
  result.fill = shapePaint(look.fill, alpha);
  result.stroke = result.halfWidth > 0.0 ? shapePaint(look.stroke, alpha) : vec4(0.0);
  return result;
}
`

const dashCommon = `
float dashCover(uint dash, float along, float across, float halfWidth, float perimeter, float aa) {
  if (dash == 0u) return 1.0;
  float width = halfWidth * 2.0;
  float period = dash == 1u ? max(width * 5.0, 8.0) : max(width * 2.5, 4.0);
  if (perimeter > 0.0) period = perimeter / max(1.0, floor(perimeter / period + 0.5));
  if (dash == 1u) {
    float m = mod(along, period);
    return smoothstep(0.0, aa, m) * (1.0 - smoothstep(period * 0.6 - aa, period * 0.6 + aa, m));
  }
  float m = mod(along, period) - period * 0.5;
  float radius = max(halfWidth * 1.2, 1.0);
  return 1.0 - smoothstep(radius - aa, radius + aa, length(vec2(m, across)));
}
`

export const shapeFillVertex: string = `${header}${shapeCommon}
layout(location = 0) in vec2 shapePosition;
layout(location = 1) in uint shapeWord;
flat out vec4 vColor;
void main() {
  vColor = shapeLook(shapeWord & shapeIndexMask).fill;
  gl_Position = vColor.a > 0.0 ? toClip(toScreen(shapePosition)) : hidden;
}
`

export const shapeFillFragment: string = `${header}
flat in vec4 vColor;
out vec4 fragColor;
void main() {
  fragColor = vColor;
}
`

export const shapeStrokeVertex: string = `${header}${shapeCommon}
layout(location = 0) in vec2 shapePrevious;
layout(location = 1) in vec4 shapeFrom;
layout(location = 2) in vec2 shapeTo;
layout(location = 3) in vec2 shapeNext;
layout(location = 4) in uint shapeWord;
out vec2 vLocal;
flat out vec4 vLine;
flat out vec4 vStroke;
flat out vec4 vFill;
flat out uint vFlags;
const float miterLimit = 4.0;
vec2 normalOf(vec2 from, vec2 to) {
  vec2 d = to - from;
  float size = length(d);
  return size > 1e-6 ? vec2(-d.y, d.x) / size : vec2(0.0);
}
vec2 cornerAt(vec2 at, vec2 own, vec2 other, bool cap, vec2 dir, float side, float extent) {
  if (cap || dot(other, other) == 0.0) return at + own * side * extent + dir * 1.5;
  vec2 sum = own + other;
  float size = length(sum);
  if (size < 1e-6) return at + own * side * extent;
  vec2 miter = sum / size;
  float scale = min(1.0 / max(dot(miter, own), 1e-4), miterLimit);
  return at + miter * side * extent * scale;
}
void main() {
  vLocal = vec2(0.0);
  vLine = vec4(0.0);
  vStroke = vec4(0.0);
  vFill = vec4(0.0);
  vFlags = 0u;
  gl_Position = hidden;
  if ((shapeWord & ${shapeSkip}u) != 0u) return;
  bool polygon = (shapeWord & ${shapePolygon}u) != 0u;
  ShapeLook look = shapeLook(shapeWord & shapeIndexMask);
  float halfWidth = look.halfWidth;
  vStroke = look.stroke;
  vFill = polygon ? look.fill : vec4(0.0);
  if (vStroke.a <= 0.0 && vFill.a <= 0.0) return;
  vec2 a = toScreen(shapeFrom.xy);
  vec2 b = toScreen(shapeTo.xy);
  vec2 p = toScreen(shapePrevious);
  vec2 q = toScreen(shapeNext);
  vec2 d = b - a;
  float size = length(d);
  if (size < 1e-6) return;
  vec2 dir = d / size;
  vec2 n = vec2(-dir.y, dir.x);
  bool capA = shapePrevious == shapeFrom.xy;
  bool capB = shapeNext == shapeTo;
  float stroke = vStroke.a > 0.0 ? halfWidth + 1.0 : 0.0;
  float outer = max(stroke, vFill.a > 0.0 ? 1.5 : 0.0);
  float inner = polygon ? stroke : outer;
  bool right = gl_VertexID % 2 == 1;
  float side = right ? 1.0 : -1.0;
  float extent = right ? inner : outer;
  vec2 corner = gl_VertexID < 2
    ? cornerAt(a, n, normalOf(p, a), capA, -dir, side, extent)
    : cornerAt(b, n, normalOf(b, q), capB, dir, side, extent);
  vLocal = vec2(dot(corner - a, dir), dot(corner - a, n));
  float scale = scaleAt(shapeFrom.xy);
  vLine = vec4(size, halfWidth, shapeFrom.z * scale, shapeFrom.w * scale);
  vFlags = look.dash | (capA ? 4u : 0u) | (capB ? 8u : 0u);
  gl_Position = toClip(corner);
}
`

export const shapeStrokeFragment: string = `${header}${dashCommon}
in vec2 vLocal;
flat in vec4 vLine;
flat in vec4 vStroke;
flat in vec4 vFill;
flat in uint vFlags;
out vec4 fragColor;
void main() {
  float aa = 0.5 / pixelRatio + 0.25;
  float along = vLocal.x;
  float across = vLocal.y;
  float span = 1.0;
  if ((vFlags & 4u) != 0u) span *= smoothstep(-aa, aa, along);
  if ((vFlags & 8u) != 0u) span *= 1.0 - smoothstep(vLine.x - aa, vLine.x + aa, along);
  float halfWidth = vLine.y;
  float cover = (1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(across))) * span;
  cover *= dashCover(vFlags & 3u, vLine.z + along, across, halfWidth, vLine.w, aa);
  vec4 stroke = vStroke * cover;
  float fringe = across < 0.0 ? clamp(0.5 + across * pixelRatio, 0.0, 1.0) : 0.0;
  vec4 result = stroke + vFill * fringe * (1.0 - stroke.a);
  if (result.a <= 0.0) discard;
  fragColor = result;
}
`

export const shapeRoundVertex: string = `${header}${shapeCommon}
layout(location = 0) in vec4 shapeBox;
layout(location = 1) in vec2 shapeExtra;
layout(location = 2) in uint shapeWord;
out vec2 vLocal;
flat out vec4 vRound;
flat out vec4 vStroke;
flat out vec4 vFill;
flat out vec2 vShape;
void main() {
  ShapeLook look = shapeLook(shapeWord & shapeIndexMask);
  float halfWidth = look.halfWidth;
  vStroke = look.stroke;
  vFill = look.fill;
  float scale = scaleAt(shapeBox.xy);
  vec2 reach = shapeBox.zw * scale;
  vRound = vec4(reach, shapeExtra * scale);
  bool rect = (shapeWord & ${shapeRect}u) != 0u;
  vShape = vec2(halfWidth, float(look.dash | (rect ? 4u : 0u)));
  vec2 corner = vec2(gl_VertexID % 2 == 1 ? 1.0 : -1.0, gl_VertexID < 2 ? -1.0 : 1.0);
  vLocal = corner * (reach + halfWidth + 1.5);
  vec2 center = toScreen(shapeBox.xy);
  bool shown = vStroke.a > 0.0 || vFill.a > 0.0;
  gl_Position = shown ? toClip(center + vLocal) : hidden;
}
`

export const shapeRoundFragment: string = `${header}${dashCommon}
in vec2 vLocal;
flat in vec4 vRound;
flat in vec4 vStroke;
flat in vec4 vFill;
flat in vec2 vShape;
out vec4 fragColor;
const float turn = 6.283185307179586;
float rectAlong(vec2 q, vec2 h, float r) {
  vec2 s = max(h - r, 0.0);
  float arc = turn * 0.25 * r;
  vec2 a = abs(q);
  float edgeX = 2.0 * s.x;
  float edgeY = 2.0 * s.y;
  float t;
  if (a.x > s.x && a.y > s.y) {
    vec2 c = vec2(q.x > 0.0 ? s.x : -s.x, q.y > 0.0 ? s.y : -s.y);
    vec2 v = q - c;
    float angle = atan(v.y, v.x);
    if (q.x > 0.0 && q.y < 0.0) t = s.x + arc * (angle + turn * 0.25) / (turn * 0.25);
    else if (q.x > 0.0) t = s.x + arc + edgeY + arc * angle / (turn * 0.25);
    else if (q.y > 0.0) t = s.x + 2.0 * arc + edgeY + edgeX + arc * (angle - turn * 0.25) / (turn * 0.25);
    else t = s.x + 3.0 * arc + 2.0 * edgeY + edgeX + arc * (angle + turn * 0.5) / (turn * 0.25);
    return t;
  }
  bool horizontal = a.x <= s.x && (a.y > s.y || h.y - a.y < h.x - a.x);
  if (horizontal) {
    if (q.y < 0.0) return q.x >= 0.0 ? q.x : s.x + 4.0 * arc + 2.0 * edgeY + edgeX + (s.x + q.x);
    return s.x + 2.0 * arc + edgeY + (s.x - q.x);
  }
  if (q.x > 0.0) return s.x + arc + (q.y + s.y);
  return s.x + 3.0 * arc + edgeY + edgeX + (s.y - q.y);
}
void main() {
  float aa = 0.5 / pixelRatio + 0.25;
  vec2 h = vRound.xy;
  float halfWidth = vShape.x;
  uint flags = uint(vShape.y);
  float d;
  float along;
  float perimeter;
  if ((flags & 4u) != 0u) {
    float r = min(vRound.w, min(h.x, h.y));
    vec2 k = abs(vLocal) - h + r;
    d = length(max(k, 0.0)) + min(max(k.x, k.y), 0.0) - r;
    along = rectAlong(vLocal, h, r);
    vec2 s = max(h - r, 0.0);
    perimeter = 4.0 * (s.x + s.y) + turn * r;
  } else {
    float size = length(vLocal);
    float inner = vRound.z;
    d = size - h.x;
    float t = atan(vLocal.x, -vLocal.y);
    if (t < 0.0) t += turn;
    along = t * h.x;
    perimeter = turn * h.x;
    if (inner > 0.0) {
      d = max(d, inner - size);
      if (size < (h.x + inner) * 0.5) {
        along = t * inner;
        perimeter = turn * inner;
      }
    }
  }
  float fill = 1.0 - smoothstep(-aa, aa, d);
  float cover = 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(d));
  cover *= dashCover(flags & 3u, along, d, halfWidth, perimeter, aa);
  vec4 stroke = vStroke * cover;
  vec4 result = stroke + vFill * fill * (1.0 - stroke.a);
  if (result.a <= 0.0) discard;
  fragColor = result;
}
`
