import { glyphLayout, header, nodeSamplers, nodeSight, spanData } from './shaders'

const miterLimit = 2

export const shapeStyleUnit = 21
export const shapeStateUnit = 22
export const shapeZoomUnit = 23
export const shapeTimeUnit = 24
export const shapePlaceUnit = 25
export const shapePointsUnit = 26
export const shapeWindow = 32
export const shapeClosed = 0x1000000
export const shapeRingPolygon = 0x2000000
export const shapeCountMask = 0xffffff
export const shapeRanged = 1
export const shapeTimed = 2
export const shapeAlive = 0x1000000
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

const shapePinned = `
#ifdef PINNED
uniform sampler2D shapePlace;
${nodeSamplers}${nodeSight}
vec3 pinOf(uint index) {
  float node = texelFetch(shapePlace, texel(index), 0).z;
  if (node < -1.5) return vec3(0.0);
  if (node < 0.0) return vec3(0.0, 0.0, 1.0);
  ivec2 t = texel(uint(node));
  if ((uint(texelFetch(nodeStyle, t, 0).w + 0.5) & 8u) == 0u) return vec3(0.0);
  return vec3(texelFetch(nodePosition, t, 0).xy, nodeShown(t));
}
#endif
ShapeLook placedLook(uint index, out vec2 shift) {
  shift = vec2(0.0);
  ShapeLook look = shapeLook(index);
#ifdef PINNED
  vec3 pin = pinOf(index);
  shift = pin.xy;
  look.fill *= pin.z;
  look.stroke *= pin.z;
#endif
  return look;
}
`

export function pinned(source: string): string {
  return source.replace('#version 300 es\n', '#version 300 es\n#define PINNED\n')
}

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

export const shapeFillVertex: string = `${header}${shapeCommon}${shapePinned}
layout(location = 0) in vec2 shapePosition;
layout(location = 1) in uint shapeWord;
flat out vec4 vColor;
#ifdef SPHERE
out float vSide;
#endif
void main() {
  vec2 shift;
  vColor = placedLook(shapeWord & shapeIndexMask, shift).fill;
#ifdef SPHERE
  vSide = worldSide(shapePosition + shift);
#endif
  gl_Position = vColor.a > 0.0 ? toClip(toScreen(shapePosition + shift)) : hidden;
}
`

export const shapeFillFragment: string = `${header}
flat in vec4 vColor;
#ifdef SPHERE
in float vSide;
#endif
out vec4 fragColor;
void main() {
#ifdef SPHERE
  if (vSide < 0.0) discard;
#endif
  fragColor = vColor;
}
`

export const shapeStrokeVertex: string = `${header}${shapeCommon}${shapePinned}
uniform sampler2D shapePoints;
layout(location = 0) in uvec4 shapeRun;
out vec2 vLocal;
flat out vec4 vLine;
flat out vec4 vStroke;
flat out vec4 vFill;
flat out uint vFlags;
#ifdef SPHERE
out float vSide;
#endif
const float miterLimit = ${miterLimit.toFixed(1)};
vec4 shapePoint(uint ring, int k) { return texelFetch(shapePoints, texel(ring + uint(k)), 0); }
vec2 unit(vec2 d) {
  float size = length(d);
  return size > 1e-6 ? d / size : vec2(0.0);
}
void main() {
  vLocal = vec2(0.0);
  vLine = vec4(0.0);
  vStroke = vec4(0.0);
  vFill = vec4(0.0);
  vFlags = 0u;
  gl_Position = hidden;
  int count = int(shapeRun.y & ${shapeCountMask}u);
  if (count < 2) return;
  vec2 shift;
  ShapeLook look = placedLook(shapeRun.w & shapeIndexMask, shift);
  bool polygon = (shapeRun.y & ${shapeRingPolygon}u) != 0u;
  bool closed = (shapeRun.y & ${shapeClosed}u) != 0u;
  vStroke = look.stroke;
  vFill = polygon ? look.fill : vec4(0.0);
  if (vStroke.a <= 0.0 && vFill.a <= 0.0) return;
  int k = min(int(shapeRun.z) + (gl_VertexID >> 1), count - 1);
  uint ring = shapeRun.x;
  vec4 here = shapePoint(ring, k);
  int before = k > 0 ? k - 1 : (closed ? count - 2 : k);
  int after = k < count - 1 ? k + 1 : (closed ? 1 : k);
  vec2 a = toScreen(here.xy + shift);
  vec2 inDir = unit(a - toScreen(shapePoint(ring, before).xy + shift));
  vec2 outDir = unit(toScreen(shapePoint(ring, after).xy + shift) - a);
  vec2 tangent = unit(inDir + outDir);
  if (dot(tangent, tangent) == 0.0) tangent = dot(outDir, outDir) > 0.0 ? outDir : inDir;
  vec2 normal = vec2(-tangent.y, tangent.x);
  vec2 edge = dot(inDir, inDir) > 0.0 ? inDir : outDir;
  float miter = 1.0 / max(abs(dot(normal, vec2(-edge.y, edge.x))), ${(1 / miterLimit).toFixed(2)});
  float side = (gl_VertexID & 1) == 1 ? 1.0 : -1.0;
  float margin = 0.5 / pixelRatio + 0.25;
  float stroke = vStroke.a > 0.0 ? look.halfWidth + margin : 0.0;
  float outer = max(stroke, vFill.a > 0.0 ? margin : 0.0);
  float extent = side > 0.0 && polygon ? stroke : outer;
  float scale = scaleAt(shapePoint(ring, 0).xy + shift);
  float along = here.z * scale;
  vec2 corner = a + normal * (side * extent * miter);
  if (!closed && k == 0) {
    corner -= tangent * margin;
    along -= margin;
  }
  if (!closed && k == count - 1) {
    corner += tangent * margin;
    along += margin;
  }
  vLocal = vec2(along, side * extent);
  vLine = vec4(here.w * scale, look.halfWidth, 0.0, closed ? here.w * scale : 0.0);
  vFlags = look.dash | (closed ? 0u : 4u);
#ifdef SPHERE
  vSide = worldSide(here.xy + shift);
#endif
  gl_Position = toClip(corner);
}
`

export const shapeStrokeFragment: string = `${header}${dashCommon}
in vec2 vLocal;
flat in vec4 vLine;
flat in vec4 vStroke;
flat in vec4 vFill;
flat in uint vFlags;
#ifdef SPHERE
in float vSide;
#endif
out vec4 fragColor;
void main() {
#ifdef SPHERE
  if (vSide < 0.0) discard;
#endif
  float aa = 0.5 / pixelRatio + 0.25;
  float along = vLocal.x;
  float across = vLocal.y;
  float span = 1.0;
  if ((vFlags & 4u) != 0u) {
    span = smoothstep(-aa, aa, along) * (1.0 - smoothstep(vLine.x - aa, vLine.x + aa, along));
  }
  float halfWidth = vLine.y;
  float cover = (1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(across))) * span;
  cover *= dashCover(vFlags & 3u, along, across, halfWidth, vLine.w, aa);
  vec4 stroke = vStroke * cover;
  float fringe = across < 0.0 ? clamp(0.5 + across * pixelRatio, 0.0, 1.0) : 0.0;
  vec4 result = stroke + vFill * fringe * (1.0 - stroke.a);
  if (result.a <= 0.0) discard;
  fragColor = result;
}
`

export const shapeRoundVertex: string = `${header}${shapeCommon}${shapePinned}
layout(location = 0) in vec4 shapeBox;
layout(location = 1) in vec2 shapeExtra;
layout(location = 2) in uint shapeWord;
out vec2 vLocal;
flat out vec4 vRound;
flat out vec4 vStroke;
flat out vec4 vFill;
flat out vec2 vShape;
void main() {
  vec2 shift;
  ShapeLook look = placedLook(shapeWord & shapeIndexMask, shift);
  float halfWidth = look.halfWidth;
  vStroke = look.stroke;
  vFill = look.fill;
  vec2 center = shapeBox.xy + shift;
  float scale = scaleAt(center);
  vec2 reach = shapeBox.zw * scale;
  vRound = vec4(reach, shapeExtra * scale);
  bool rect = (shapeWord & ${shapeRect}u) != 0u;
  vShape = vec2(halfWidth, float(look.dash | (rect ? 4u : 0u)));
  vec2 corner = vec2(gl_VertexID % 2 == 1 ? 1.0 : -1.0, gl_VertexID < 2 ? -1.0 : 1.0);
  vLocal = corner * (reach + halfWidth + 1.5);
  vec2 screen = toScreen(center);
  bool shown = vStroke.a > 0.0 || vFill.a > 0.0;
#ifdef SPHERE
  shown = shown && worldSide(center) >= 0.0;
#endif
  gl_Position = shown ? toClip(screen + vLocal) : hidden;
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

export const shapeLabelVertex: string = `${header}${shapeCommon}${nodeSamplers}${nodeSight}
uniform sampler2D shapePlace;
${glyphLayout}
void main() {
  vPlate = vec4(0.0);
  vOpacity = 0.0;
  uint kind = glyphKind & 3u;
  vUv = mix(glyphUv.xy, glyphUv.zw, corner);
  gl_Position = hidden;
  ivec2 t = texel(glyphNode);
  uvec4 style = texelFetch(shapeStyle, t, 0);
  if ((style.w & ${shapeAlive}u) == 0u) return;
  uint mask = texelFetch(shapeState, t, 0).r;
  if ((mask & stateShapes.y) != 0u || (~mask & stateShapes.w) != 0u) return;
  if (anyHidden(hiddenShapes) && slotHidden(hiddenShapes, (style.w >> 16u) & 255u)) return;
  float shown = (shapeFlags & ${shapeRanged}u) != 0u ? zoomShown(texelFetch(shapeZoom, t, 0).xy) : 1.0;
  if (timed > 0.5 && (shapeFlags & ${shapeTimed}u) != 0u && shown > 0.0) {
    shown *= timeShown(texelFetch(shapeTime, t, 0));
  }
  vec4 place = texelFetch(shapePlace, t, 0);
  vec2 at = place.xy;
  if (place.z < -1.5) return;
  if (place.z >= 0.0) {
    ivec2 n = texel(uint(place.z));
    if ((uint(texelFetch(nodeStyle, n, 0).w + 0.5) & 8u) == 0u) return;
    at += texelFetch(nodePosition, n, 0).xy;
    shown *= nodeShown(n);
  }
  Look look = resolve(mask, Look(1.0, 0.0, 0.0, 1.0, none, none, none, 0.0, none), 128);
  float pixels = glyphSize * min(1.0, zoom);
  if (look.label > 1.5) pixels = max(pixels, min(glyphSize, labelMin));
  vOpacity = look.opacity * shown;
  if (vOpacity <= 0.0 || look.label < 0.5 || (pixels < labelMin && look.label < 1.5)) return;
  if (worldSide(at) < 0.0) return;
  gl_Position = toClip(toScreen(at) + layoutGlyph(kind, pixels, 0.0, look.labelColor, 0u));
}
`

export function sphereVariant(source: string): string {
  return source.replace('#version 300 es\n', '#version 300 es\n#define SPHERE\n')
}
