import { curveSegments, loopGrowth, loopMinimum, loopTurn } from '../core/edge-curve'
import { atlasFontSize } from './glyph-atlas'

export const badgeLimit = 18
export const badgeMin = 10
export const badgeTextMin = 12
export const badgeFont = 0.66
export const badgeRing = 1.5
export const platePadX = 0.45
export const plateRadius = 0.25
export const plateDrop = 6
export const nodeLabelSize = 12
export const labelGap = 3
export const edgeLabelSize = 11
export const edgeDescent = 3.6
export const edgeLabelGap = 1.5
export const uprightSlack = 1e-4

export const header: string = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
precision highp sampler2DArray;
layout(std140) uniform Frame {
  vec2 center;
  vec2 viewport;
  float zoom;
  float pixelRatio;
  float haloWidth;
  float labelMin;
  vec4 haloColor;
  vec4 labelInk;
  vec4 labelMuted;
  vec4 labelHalo;
  vec2 centerLow;
};
layout(std140) uniform States {
  vec4 stateNumbers[64];
  uvec4 statePaint[64];
  uvec4 stateLabel[64];
};
uniform int layerSlot;
uniform int overlay;
uniform sampler2D palette;
const uint highlightMask = 7u;
const uint none = 0xffffffffu;
const vec4 hidden = vec4(2.0, 2.0, 2.0, 1.0);
vec2 toScreen(vec2 world) { return (world - center - centerLow) * zoom + viewport * 0.5; }
vec4 toClip(vec2 screen) {
  return vec4(screen.x / viewport.x * 2.0 - 1.0, 1.0 - screen.y / viewport.y * 2.0, 0.0, 1.0);
}
ivec2 texel(uint index) { return ivec2(int(index & 1023u), int(index >> 10u)); }
vec4 paletteColor(uint id) { return texelFetch(palette, ivec2(int(id & 255u), int(id >> 8u)), 0); }
struct Look { float opacity; float strokeWidth; float halo; float label; uint fill; uint stroke; uint outline; float outlineWidth; uint labelColor; };
Look resolve(uint mask, Look look, int table) {
  bool opacity = false;
  bool strokeWidth = false;
  bool halo = false;
  bool label = false;
  bool fill = false;
  bool stroke = false;
  bool outline = false;
  bool outlineWidth = false;
  bool labelColor = false;
  float base = look.opacity;
  for (int bit = 0; bit < 32; bit++) {
    if (mask == 0u) break;
    bool present = (mask & 1u) != 0u;
    mask >>= 1u;
    if (!present) continue;
    vec4 numbers = stateNumbers[table + bit];
    uvec4 paint = statePaint[table + bit];
    if (!opacity && numbers.x >= 0.0) { look.opacity = base * numbers.x; opacity = true; }
    if (!strokeWidth && numbers.y >= 0.0) { look.strokeWidth = numbers.y; strokeWidth = true; }
    if (!halo && numbers.z >= 0.0) { look.halo = numbers.z; halo = true; }
    if (!label && numbers.w >= 0.0) { look.label = numbers.w; label = true; }
    if (!fill && paint.x != none) { look.fill = paint.x; fill = true; }
    if (!stroke && paint.y != none) { look.stroke = paint.y; stroke = true; }
    if (!outline && paint.z != none) { look.outline = paint.z; outline = true; }
    if (!outlineWidth && paint.w != none) { look.outlineWidth = uintBitsToFloat(paint.w); outlineWidth = true; }
    uint text = stateLabel[table + bit].x;
    if (!labelColor && text != none) { look.labelColor = text; labelColor = true; }
  }
  return look;
}
`

const nodeData = `
uniform sampler2D nodePosition;
uniform sampler2D nodeStyle;
uniform usampler2D nodePaint;
uniform usampler2D nodeState;
uniform usampler2D nodeDecor;
uniform sampler2D nodeBox;
Look nodeLook(ivec2 t, vec4 style, uvec4 paint, uint mask) {
  float outlineWidth = uintBitsToFloat(texelFetch(nodeDecor, t, 0).w);
  return resolve(mask, Look(style.z, style.y, 0.0, 1.0, paint.x, paint.y, paint.w, outlineWidth, none), 0);
}
float nodeDiameter(vec4 style) {
  uint flags = uint(style.w + 0.5);
  return (flags & 4u) != 0u ? style.x : style.x * zoom;
}
float nodeRadius(vec4 style) { return max(nodeDiameter(style) * 0.5, 1.25); }
float badgeHeight(vec4 style) { return min(nodeDiameter(style) * 0.55, ${badgeLimit.toFixed(1)}); }
vec2 badgeCenter(vec2 xy, vec4 style, uint corner) {
  uint shape = uint(style.w + 0.5) & 3u;
  float reach = shape == 0u ? 0.70710678 : shape == 1u ? 0.86 : 0.6;
  vec2 side = vec2((corner & 1u) != 0u ? 1.0 : -1.0, (corner & 2u) != 0u ? 1.0 : -1.0);
  return toScreen(xy) + side * reach * nodeRadius(style);
}
`

const edgeData = `
uniform usampler2D edgeTopology;
uniform sampler2D edgeStyle;
uniform usampler2D edgeState;
uniform float flowTime;
float edgeFlow(uint mask, float speed) {
  for (int bit = 0; bit < 32; bit++) {
    if (mask == 0u) break;
    bool present = (mask & 1u) != 0u;
    mask >>= 1u;
    if (!present) continue;
    uint flow = stateLabel[32 + bit].y;
    if (flow != none) return uintBitsToFloat(flow);
  }
  return speed;
}
`

export const nodeVertex: string = `${header}${nodeData}
in vec2 corner;
in uint instance;
out vec2 vLocal;
flat out float vImageLayer;
flat out float vImageScale;
flat out vec4 vImageColor;
flat out float vRadius;
flat out float vStrokeWidth;
flat out float vHaloWidth;
flat out float vOutlineWidth;
flat out uint vShape;
flat out vec3 vBox;
flat out vec4 vFill;
flat out vec4 vStroke;
flat out vec4 vOutline;
flat out float vOpacity;
void main() {
  ivec2 t = texel(instance);
  vec4 style = texelFetch(nodeStyle, t, 0);
  uvec4 paint = texelFetch(nodePaint, t, 0);
  uint flags = uint(style.w + 0.5);
  uint mask = texelFetch(nodeState, t, 0).r;
  bool highlighted = (mask & highlightMask) != 0u;
  bool container = (flags & 3u) == 3u;
  if ((flags & 8u) == 0u || container != (overlay == 2) || (overlay == 0 && (int(paint.z) != layerSlot || highlighted))) {
    gl_Position = hidden;
    return;
  }
  Look look = nodeLook(t, style, paint, mask);
  vec2 xy = texelFetch(nodePosition, t, 0).xy;
  float radius = nodeRadius(style);
  vec2 extent = vec2(radius);
  vBox = vec3(0.0);
  if (container) {
    vec4 box = texelFetch(nodeBox, t, 0);
    extent = max(box.xy * zoom, vec2(1.25));
    radius = min(extent.x, extent.y);
    vBox = vec3(extent, min(box.z * zoom, radius));
  }
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  float outline = max(look.outlineWidth, 0.0);
  float aa = 0.5 / pixelRatio + 0.25;
  uint shape = flags & 3u;
  vec2 reach = shape == 2u ? (extent * 1.2 + outline + halo + aa) * 1.4143
    : (shape == 1u ? extent * 0.86 : extent) + outline + halo + aa;
  vec2 center = toScreen(xy);
  if (any(lessThan(center + reach, vec2(0.0))) || any(greaterThan(center - reach, viewport))) {
    gl_Position = hidden;
    return;
  }
  vLocal = corner * reach;
  vRadius = radius;
  vStrokeWidth = min(look.strokeWidth, radius * 0.5);
  vHaloWidth = halo;
  vOutlineWidth = outline;
  vOutline = paletteColor(look.outline);
  vShape = flags & 3u;
  vFill = paletteColor(look.fill);
  vStroke = paletteColor(look.stroke);
  vOpacity = look.opacity;
  uvec4 image = texelFetch(nodeDecor, t, 0);
  vImageLayer = float(image.x) - 1.0;
  vImageScale = max(uintBitsToFloat(image.z), 0.001);
  vImageColor = image.y == none ? vec4(-1.0) : paletteColor(image.y);
  gl_Position = toClip(center + vLocal);
}
`

export const nodeFragment: string = `${header}
uniform sampler2DArray images;
in vec2 vLocal;
flat in float vImageLayer;
flat in float vImageScale;
flat in vec4 vImageColor;
flat in float vRadius;
flat in float vStrokeWidth;
flat in float vHaloWidth;
flat in float vOutlineWidth;
flat in uint vShape;
flat in vec3 vBox;
flat in vec4 vFill;
flat in vec4 vStroke;
flat in vec4 vOutline;
flat in float vOpacity;
out vec4 fragColor;
float shapeDistance(vec2 p, float r) {
  if (vShape == 0u) return length(p) - r;
  if (vShape == 3u) {
    vec2 q = abs(p) - vBox.xy + vBox.z;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vBox.z;
  }
  if (vShape == 1u) {
    vec2 q = abs(p) - vec2(r * 0.86);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  }
  return (abs(p.x) + abs(p.y) - r * 1.2) * 0.70710678;
}
void main() {
  float aa = 0.5 / pixelRatio + 0.25;
  float d = shapeDistance(vLocal, vRadius);
  float inside = 1.0 - smoothstep(-aa, aa, d);
  float ring = vStrokeWidth > 0.0 ? smoothstep(-vStrokeWidth - aa, -vStrokeWidth + aa, d) : 0.0;
  vec4 fill = vec4(vFill.rgb * vFill.a, vFill.a);
  if (vImageLayer >= 0.0) {
    vec2 uv = vLocal / (vRadius * 2.0 * vImageScale) + 0.5;
    vec4 picture = texture(images, vec3(uv, vImageLayer));
    vec2 within = step(vec2(0.0), uv) * step(uv, vec2(1.0));
    picture *= within.x * within.y;
    if (vImageColor.a >= 0.0) picture = vec4(vImageColor.rgb * vImageColor.a, vImageColor.a) * picture.a;
    fill = picture + fill * (1.0 - picture.a);
  }
  vec4 color = mix(fill, vec4(vStroke.rgb * vStroke.a, vStroke.a), ring);
  vec4 result = color * inside * vOpacity;
  if (vOutlineWidth > 0.0) {
    float outer = 1.0 - smoothstep(vOutlineWidth - aa, vOutlineWidth + aa, d);
    result = mix(vec4(vOutline.rgb * vOutline.a, vOutline.a), color, inside) * outer * vOpacity;
  }
  if (vHaloWidth > 0.0) {
    float h = haloColor.a * (1.0 - smoothstep(0.0, vHaloWidth, d - vOutlineWidth)) * vOpacity;
    result += vec4(haloColor.rgb * h, h) * (1.0 - result.a);
  }
  if (result.a < 0.002) discard;
  fragColor = result;
}
`

export const edgeVertex: string = `${header}${nodeData}${edgeData}
in vec3 corner;
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
  if ((packed & 16u) == 0u || (overlay == 0 && (int(packed >> 5u) != layerSlot || highlighted))) {
    gl_Position = hidden;
    return;
  }
  if (topology.x == topology.y || style.z != 0.0) {
    gl_Position = hidden;
    return;
  }
  Look look = resolve(mask, Look(style.y, style.x, 0.0, 1.0, none, topology.z, none, 0.0, none), 32);
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 ps = toScreen(texelFetch(nodePosition, s, 0).xy);
  vec2 pt = toScreen(texelFetch(nodePosition, e, 0).xy);
  float width = max(look.strokeWidth, 0.5);
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  float margin = 0.5 / pixelRatio + 0.25;
  float arrowHalf = max(width * 1.6, 3.0);
  float head = max(width * 0.5, arrowHalf) + halo + margin;
  if (any(lessThan(max(ps, pt) + head, vec2(0.0))) || any(greaterThan(min(ps, pt) - head, viewport))) {
    gl_Position = hidden;
    return;
  }
  vec2 delta = pt - ps;
  float len = length(delta);
  vec2 dir = len > 0.0 ? delta / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float start = nodeRadius(texelFetch(nodeStyle, s, 0));
  float end = len - nodeRadius(texelFetch(nodeStyle, e, 0));
  float visible = end - start;
  uint arrow = (packed >> 2u) & 3u;
  float arrowLength = arrow != 0u && visible > width * 8.0 ? max(width * 4.0, 6.0) : 0.0;
  float startHead = (arrow & 1u) != 0u ? arrowLength : 0.0;
  float endHead = (arrow & 2u) != 0u ? arrowLength : 0.0;
  float flow = edgeFlow(mask, style.w);
  uint dash = (packed & 3u) == 0u && flow != 0.0 ? 1u : packed & 3u;
  float body = (dash == 2u ? max(width * 0.6, 1.0) : width * 0.5) + halo + margin;
  head = max(body, head);
  float along = corner.x < 0.5 ? start - margin
    : corner.x < 1.5 ? start + startHead
    : corner.x < 2.5 ? end - endHead
    : end + margin;
  float extent = corner.z < 0.5 ? body
    : corner.z < 1.5 ? (startHead > 0.0 ? head : body)
    : (endHead > 0.0 ? head : body);
  float across = corner.y * extent;
  vPos = vec2(along, across);
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
  gl_Position = visible > 0.5 ? toClip(ps + dir * along + normal * across) : hidden;
}
`

const segments = curveSegments.toFixed(1)

export const curveVertex: string = `${header}${nodeData}${edgeData}
in vec3 corner;
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
vec2 cubicAt(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
}
vec2 cubicTangent(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return 3.0 * u * u * (b - a) + 6.0 * u * t * (c - b) + 3.0 * t * t * (d - c);
}
float crossing(vec2 a, vec2 b, vec2 c, vec2 d, vec2 point, float radius, float lo, float hi, bool rising) {
  for (int i = 0; i < 14; i++) {
    float mid = (lo + hi) * 0.5;
    bool inside = distance(cubicAt(a, b, c, d, mid), point) < radius;
    if (inside == rising) lo = mid; else hi = mid;
  }
  return (lo + hi) * 0.5;
}
float arcLength(vec2 a, vec2 b, vec2 c, vec2 d, float from, float to) {
  float total = 0.0;
  vec2 previous = cubicAt(a, b, c, d, from);
  for (int i = 1; i <= 8; i++) {
    vec2 next = cubicAt(a, b, c, d, mix(from, to, float(i) / 8.0));
    total += distance(previous, next);
    previous = next;
  }
  return total;
}
vec2 turn(vec2 v, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}
void main() {
  ivec2 t = texel(instance);
  uvec4 topology = texelFetch(edgeTopology, t, 0);
  vec4 style = texelFetch(edgeStyle, t, 0);
  uint packed = topology.w;
  uint mask = texelFetch(edgeState, t, 0).r;
  bool highlighted = (mask & highlightMask) != 0u;
  bool loop = topology.x == topology.y;
  if ((packed & 16u) == 0u || (!loop && style.z == 0.0) || (overlay == 0 && (int(packed >> 5u) != layerSlot || highlighted))) {
    gl_Position = hidden;
    return;
  }
  Look look = resolve(mask, Look(style.y, style.x, 0.0, 1.0, none, topology.z, none, 0.0, none), 32);
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 a = toScreen(texelFetch(nodePosition, s, 0).xy);
  vec2 d = toScreen(texelFetch(nodePosition, e, 0).xy);
  float sourceRadius = nodeRadius(texelFetch(nodeStyle, s, 0));
  float targetRadius = nodeRadius(texelFetch(nodeStyle, e, 0));
  vec2 b;
  vec2 c;
  if (loop) {
    float reach = sourceRadius + max(sourceRadius * 1.5, ${loopMinimum.toFixed(1)}) * (1.0 + ${loopGrowth.toFixed(2)} * style.z);
    float arm = reach / (0.75 * cos(${loopTurn.toFixed(4)}));
    vec2 u = vec2(0.70710678, -0.70710678);
    b = a + arm * turn(u, ${loopTurn.toFixed(4)});
    c = a + arm * turn(u, -${loopTurn.toFixed(4)});
  } else {
    vec2 delta = d - a;
    float len = length(delta);
    vec2 side = len > 0.0 ? vec2(-delta.y, delta.x) / len : vec2(0.0, 1.0);
    vec2 control = (a + d) * 0.5 + side * (2.0 * style.z * len);
    b = a + (control - a) * (2.0 / 3.0);
    c = d + (control - d) * (2.0 / 3.0);
  }
  float width = max(look.strokeWidth, 0.5);
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  float margin = 0.5 / pixelRatio + 0.25;
  float arrowHalf = max(width * 1.6, 3.0);
  float pad = max(width * 0.5, arrowHalf) + halo + margin;
  vec2 low = min(min(a, b), min(c, d)) - pad;
  vec2 high = max(max(a, b), max(c, d)) + pad;
  if (any(lessThan(high, vec2(0.0))) || any(greaterThan(low, viewport))) {
    gl_Position = hidden;
    return;
  }
  float t0 = crossing(a, b, c, d, a, sourceRadius, 0.0, 0.5, true);
  float t1 = crossing(a, b, c, d, d, targetRadius, 0.5, 1.0, false);
  float visible = arcLength(a, b, c, d, t0, t1);
  uint arrow = (packed >> 2u) & 3u;
  float arrowLength = arrow != 0u && visible > width * 8.0 ? max(width * 4.0, 6.0) : 0.0;
  float startHead = (arrow & 1u) != 0u ? arrowLength : 0.0;
  float endHead = (arrow & 2u) != 0u ? arrowLength : 0.0;
  vec2 first = cubicAt(a, b, c, d, t0);
  vec2 last = cubicAt(a, b, c, d, t1);
  float ta = startHead > 0.0 ? crossing(a, b, c, d, first, startHead, t0, t1, true) : t0;
  float tb = endHead > 0.0 ? crossing(a, b, c, d, last, endHead, t0, t1, false) : t1;
  float flow = edgeFlow(mask, style.w);
  uint dash = (packed & 3u) == 0u && flow != 0.0 ? 1u : packed & 3u;
  float body = (dash == 2u ? max(width * 0.6, 1.0) : width * 0.5) + halo + margin;
  float head = max(body, arrowHalf + halo + margin);
  int station = int(corner.x + 0.5);
  float at;
  float along;
  float push = 0.0;
  if (station == 0) {
    at = t0;
    along = -margin;
    push = -margin;
  } else if (station > int(${segments}) + 1) {
    at = t1;
    along = visible + margin;
    push = margin;
  } else {
    float f = float(station - 1) / ${segments};
    at = mix(ta, tb, f);
    along = mix(startHead, visible - endHead, f);
  }
  vec2 tangent = cubicTangent(a, b, c, d, at);
  float tangentLength = length(tangent);
  vec2 dir = tangentLength > 0.0 ? tangent / tangentLength : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float extent = corner.z < 0.5 ? body
    : corner.z < 1.5 ? (startHead > 0.0 ? head : body)
    : (endHead > 0.0 ? head : body);
  float across = corner.y * extent;
  vPos = vec2(along, across);
  vStart = 0.0;
  vEnd = visible;
  vHalfWidth = width * 0.5;
  vArrowLength = arrowLength;
  vArrowHalf = arrowHalf;
  vHaloWidth = halo;
  vDash = dash;
  vFlow = flow * flowTime;
  vArrow = arrow;
  vColor = paletteColor(look.stroke);
  vOpacity = look.opacity;
  gl_Position = visible > 0.5 ? toClip(cubicAt(a, b, c, d, at) + dir * push + normal * across) : hidden;
}
`

export const edgeFragment: string = `${header}
in vec2 vPos;
flat in float vStart;
flat in float vEnd;
flat in float vHalfWidth;
flat in float vArrowLength;
flat in float vArrowHalf;
flat in float vHaloWidth;
flat in uint vDash;
flat in uint vArrow;
flat in vec4 vColor;
flat in float vOpacity;
flat in float vFlow;
out vec4 fragColor;
void main() {
  float aa = 0.5 / pixelRatio + 0.25;
  float along = vPos.x;
  float halfWidth = vHalfWidth;
  bool head = false;
  if (vArrowLength > 0.0) {
    if ((vArrow & 2u) != 0u && along > vEnd - vArrowLength) {
      halfWidth = vArrowHalf * (vEnd - along) / vArrowLength;
      head = true;
    }
    if ((vArrow & 1u) != 0u && along < vStart + vArrowLength) {
      halfWidth = vArrowHalf * (along - vStart) / vArrowLength;
      head = true;
    }
  }
  float span = smoothstep(vStart - aa, vStart + aa, along) * (1.0 - smoothstep(vEnd - aa, vEnd + aa, along));
  float coverage = (1.0 - smoothstep(halfWidth - aa, halfWidth + aa, abs(vPos.y))) * span;
  if (!head && vDash != 0u) {
    float width = vHalfWidth * 2.0;
    float offset = along - vStart - vFlow;
    if (vDash == 1u) {
      float period = max(width * 5.0, 8.0);
      float m = mod(offset, period);
      coverage *= smoothstep(0.0, aa, m) * (1.0 - smoothstep(period * 0.6 - aa, period * 0.6 + aa, m));
    } else {
      float period = max(width * 2.5, 4.0);
      float m = mod(offset, period) - period * 0.5;
      float radius = max(width * 0.6, 1.0);
      coverage = (1.0 - smoothstep(radius - aa, radius + aa, length(vec2(m, vPos.y)))) * span;
    }
  }
  float alpha = vColor.a * coverage * vOpacity;
  vec4 result = vec4(vColor.rgb * alpha, alpha);
  if (vHaloWidth > 0.0) {
    float distance = max(abs(vPos.y) - halfWidth, 0.0);
    float h = haloColor.a * (1.0 - smoothstep(0.0, vHaloWidth, distance)) * span * vOpacity;
    result += vec4(haloColor.rgb * h, h) * (1.0 - result.a);
  }
  fragColor = result;
}
`

export const labelVertex: string = `${header}${nodeData}${edgeData}
uniform float atlasFontSize;
in vec2 corner;
in uint glyphNode;
in uint glyphKind;
in vec4 glyphRect;
in vec4 glyphUv;
in uint glyphColor;
in float glyphSize;
out vec2 vUv;
out float vScale;
flat out vec4 vInk;
flat out float vHalo;
flat out vec4 vPlate;
flat out float vOpacity;
vec2 layoutGlyph(uint kind, float pixels, float lift, uint stateColor) {
  float scale = pixels / atlasFontSize;
  if (kind == 3u) {
    vec2 extent = glyphRect.zw * scale;
    vUv = (corner * 2.0 - 1.0) * (extent + 1.0);
    vPlate = vec4(extent, pixels * ${plateRadius.toFixed(2)}, 1.0);
    vScale = 1.0;
    vInk = paletteColor(glyphColor);
    vHalo = 0.0;
    return glyphRect.xy * scale + vUv;
  }
  vScale = scale;
  vInk = kind == 0u && stateColor != none ? paletteColor(stateColor)
    : glyphColor != none ? paletteColor(glyphColor)
    : kind == 0u ? labelInk : labelMuted;
  vHalo = (glyphKind & 4u) != 0u ? 0.0 : 1.0;
  return (glyphRect.xy + corner * glyphRect.zw) * scale - vec2(0.0, lift);
}
void edgeGlyph(uint kind) {
  ivec2 t = texel(glyphNode);
  uvec4 topology = texelFetch(edgeTopology, t, 0);
  vec4 style = texelFetch(edgeStyle, t, 0);
  uint mask = texelFetch(edgeState, t, 0).r;
  Look look = resolve(mask, Look(style.y, style.x, 0.0, 1.0, none, topology.z, none, 0.0, none), 32);
  float pixels = glyphSize * min(1.0, zoom);
  if ((topology.w & 16u) == 0u || look.label < 0.5 || pixels < labelMin) {
    gl_Position = hidden;
    return;
  }
  vOpacity = look.opacity;
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 a = toScreen(texelFetch(nodePosition, s, 0).xy);
  float sourceRadius = nodeRadius(texelFetch(nodeStyle, s, 0));
  vec2 spot;
  vec2 axis;
  if (topology.x == topology.y) {
    float reach = sourceRadius + max(sourceRadius * 1.5, ${loopMinimum.toFixed(1)}) * (1.0 + ${loopGrowth.toFixed(2)} * style.z);
    spot = a + reach * vec2(0.70710678, -0.70710678);
    axis = vec2(0.70710678, 0.70710678);
  } else {
    vec2 d = toScreen(texelFetch(nodePosition, e, 0).xy);
    float targetRadius = nodeRadius(texelFetch(nodeStyle, e, 0));
    vec2 delta = d - a;
    float len = length(delta);
    vec2 dir = len > 0.0 ? delta / len : vec2(1.0, 0.0);
    spot = (a + d) * 0.5 + dir * ((sourceRadius - targetRadius) * 0.5) + vec2(-dir.y, dir.x) * (style.z * len);
    axis = dir.x < -${uprightSlack.toFixed(4)} || (abs(dir.x) <= ${uprightSlack.toFixed(4)} && dir.y < 0.0) ? -dir : dir;
  }
  vec2 across = vec2(-axis.y, axis.x);
  float lift = (glyphKind & 4u) != 0u ? 0.0 : max(look.strokeWidth, 0.5) * 0.5 + ${edgeLabelGap.toFixed(1)};
  vec2 local = layoutGlyph(kind, pixels, lift, look.labelColor);
  gl_Position = toClip(spot + axis * local.x + across * local.y);
}
void main() {
  vPlate = vec4(0.0);
  uint kind = glyphKind & 3u;
  vUv = mix(glyphUv.xy, glyphUv.zw, corner);
  if (kind != 2u && (glyphKind & 8u) != 0u) {
    edgeGlyph(kind);
    return;
  }
  ivec2 t = texel(glyphNode);
  vec4 style = texelFetch(nodeStyle, t, 0);
  uvec4 paint = texelFetch(nodePaint, t, 0);
  uint flags = uint(style.w + 0.5);
  uint mask = texelFetch(nodeState, t, 0).r;
  Look look = nodeLook(t, style, paint, mask);
  vOpacity = look.opacity;
  if (kind == 2u) {
    bool highlighted = (mask & highlightMask) != 0u;
    float height = badgeHeight(style);
    if ((flags & 8u) == 0u || highlighted != (overlay == 1) || height < ${badgeTextMin.toFixed(1)}) {
      gl_Position = hidden;
      return;
    }
    float font = height * ${badgeFont.toFixed(2)};
    vec2 center = badgeCenter(texelFetch(nodePosition, t, 0).xy, style, (glyphKind >> 2u) & 3u);
    vScale = font / atlasFontSize;
    vInk = paletteColor(glyphColor);
    vHalo = 0.0;
    gl_Position = toClip(center - vec2(0.0, font * 0.65) + (glyphRect.xy + corner * glyphRect.zw) * vScale);
    return;
  }
  float pixels = glyphSize * ((flags & 4u) != 0u ? 1.0 : min(1.0, zoom));
  if ((flags & 8u) == 0u || look.label < 0.5 || pixels < labelMin) {
    gl_Position = hidden;
    return;
  }
  uint placement = (glyphKind >> 4u) & 7u;
  vec2 dir = placement == 0u ? vec2(0.0, 1.0)
    : placement == 1u ? vec2(0.0, -1.0)
    : placement == 2u ? vec2(1.0, 0.0)
    : placement == 3u ? vec2(-1.0, 0.0)
    : vec2(0.0);
  float edge = nodeRadius(style);
  if ((flags & 3u) == 3u) {
    vec2 extent = texelFetch(nodeBox, t, 0).xy * zoom;
    edge = abs(dir.x) > 0.5 ? extent.x : extent.y;
  }
  float reach = placement == 4u ? 0.0 : edge + max(look.outlineWidth, 0.0) + ${labelGap.toFixed(1)};
  vec2 anchor = toScreen(texelFetch(nodePosition, t, 0).xy) + dir * reach;
  gl_Position = toClip(anchor + layoutGlyph(kind, pixels, 0.0, look.labelColor));
}
`

export const labelFragment: string = `${header}
uniform sampler2D atlas;
in vec2 vUv;
in float vScale;
flat in vec4 vInk;
flat in float vHalo;
flat in vec4 vPlate;
flat in float vOpacity;
out vec4 fragColor;
void main() {
  if (vPlate.w > 0.5) {
    vec2 q = abs(vUv) - vPlate.xy + vPlate.z;
    float edge = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - vPlate.z;
    float aa = 0.5 / pixelRatio + 0.25;
    float cover = vInk.a * (1.0 - smoothstep(-aa, aa, edge)) * vOpacity;
    if (cover < 0.002) discard;
    fragColor = vec4(vInk.rgb * cover, cover);
    return;
  }
  float d = texture(atlas, vUv).r;
  float gamma = 0.08 / max(vScale * pixelRatio, 0.05);
  float ink = smoothstep(0.75 - gamma, 0.75 + gamma, d);
  float halo = smoothstep(0.55 - gamma, 0.55 + gamma, d) * vHalo;
  vec3 rgb = vHalo > 0.5 ? mix(labelHalo.rgb, vInk.rgb, ink) : vInk.rgb;
  float alpha = max(halo * labelHalo.a, ink * vInk.a) * vOpacity;
  if (alpha < 0.002) discard;
  fragColor = vec4(rgb * alpha, alpha);
}
`

export const badgeVertex: string = `${header}${nodeData}
in vec2 corner;
in uint badgeNode;
in uint badgeInfo;
in uint badgeFill;
in uint badgeRingColor;
in float badgeText;
out vec2 vLocal;
flat out vec2 vHalf;
flat out vec4 vFill;
flat out vec4 vRing;
flat out float vOpacity;
void main() {
  ivec2 t = texel(badgeNode);
  vec4 style = texelFetch(nodeStyle, t, 0);
  uvec4 paint = texelFetch(nodePaint, t, 0);
  uint flags = uint(style.w + 0.5);
  uint mask = texelFetch(nodeState, t, 0).r;
  bool highlighted = (mask & highlightMask) != 0u;
  float height = badgeHeight(style);
  if ((flags & 8u) == 0u || highlighted != (overlay == 1) || height < ${badgeMin.toFixed(1)}) {
    gl_Position = hidden;
    return;
  }
  Look look = nodeLook(t, style, paint, mask);
  bool text = (badgeInfo & 4u) != 0u && height >= ${badgeTextMin.toFixed(1)};
  float font = height * ${badgeFont.toFixed(2)};
  float width = text ? max(height, badgeText * font / ${atlasFontSize.toFixed(1)} + height * 0.6) : height;
  vec2 center = badgeCenter(texelFetch(nodePosition, t, 0).xy, style, badgeInfo & 3u);
  vHalf = vec2(width, height) * 0.5;
  vLocal = corner * (vHalf + ${badgeRing.toFixed(1)} + 1.0);
  vFill = paletteColor(badgeFill);
  vRing = paletteColor(badgeRingColor);
  vOpacity = look.opacity;
  gl_Position = toClip(center + vLocal);
}
`

export const badgeFragment: string = `${header}
in vec2 vLocal;
flat in vec2 vHalf;
flat in vec4 vFill;
flat in vec4 vRing;
flat in float vOpacity;
out vec4 fragColor;
void main() {
  float aa = 0.5 / pixelRatio + 0.25;
  vec2 q = vec2(max(abs(vLocal.x) - (vHalf.x - vHalf.y), 0.0), vLocal.y);
  float d = length(q) - vHalf.y;
  float inner = 1.0 - smoothstep(-aa, aa, d);
  float outer = 1.0 - smoothstep(${badgeRing.toFixed(1)} - aa, ${badgeRing.toFixed(1)} + aa, d);
  vec4 fill = vec4(vFill.rgb * vFill.a, vFill.a);
  vec4 ring = vec4(vRing.rgb * vRing.a, vRing.a);
  vec4 result = mix(ring, fill, inner) * outer * vOpacity;
  if (result.a < 0.002) discard;
  fragColor = result;
}
`

export const cornerNode: Float32Array = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
export const cornerEdge: Float32Array = new Float32Array([
  0, -1, 1, 0, 1, 1, 1, -1, 1, 1, 1, 1, 1, -1, 0, 1, 1, 0, 2, -1, 0, 2, 1, 0, 2, -1, 2, 2, 1, 2, 3,
  -1, 2, 3, 1, 2,
])
function curveCorners(): Float32Array {
  const values: number[] = [0, -1, 1, 0, 1, 1, 1, -1, 1, 1, 1, 1]
  for (let station = 1; station <= curveSegments + 1; station++)
    values.push(station, -1, 0, station, 1, 0)
  const end = curveSegments + 1
  values.push(end, -1, 2, end, 1, 2, end + 1, -1, 2, end + 1, 1, 2)
  return new Float32Array(values)
}

export const cornerCurve: Float32Array = curveCorners()
export const cornerLabel: Float32Array = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])
