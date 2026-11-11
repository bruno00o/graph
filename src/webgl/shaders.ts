import { curveSegments, loopGrowth, loopMinimum, loopTurn } from '../core/edge-curve'
import { arcThreshold } from '../core/geo-arc'
import { boxBadgeInset } from '../core/node-shape'
import { leastFade } from '../core/time-range'
import { zoomFade } from '../core/zoom-range'
import { bridgeData, bridgeFragment, straightBridges } from './bridge-glsl'
import { bundlePath } from './bundle-glsl'
import { atlasFontSize } from './glyph-atlas'

export { nodeLabelSize } from '../core/label-width'

export const badgeLimit = 18
export const badgeMin = 10
export const badgeTextMin = 12
export const badgeFont = 0.66
export const badgeRing = 1.5
export const platePadX = 0.45
export const plateRadius = 0.25
export const plateDrop = 6
export const labelGap = 3
export const edgeLabelSize = 11
export const edgeDescent = 3.6
export const edgeLabelGap = 1.5
export const uprightSlack = 1e-4
export const endLabelGap = 4
export const endWidthUnit = 64
export const endSplitFlag: number = 1 << 20
export const endHalvesFlag: number = 1 << 21
export const endLabelWidthUnit = 16
export const boxFlag = 4096
export const mutedPaper = 0.75
export const insideGlyph = 128

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
  float ranged;
  float halved;
  vec4 timeWindow;
  float timed;
  float timeFade;
  float timePoint;
  float timePadding;
  mat4 globeMatrix;
  vec4 globePlane;
  vec4 globeFrame;
  vec4 globeInfo;
  vec4 globeMore;
  uvec4 hiddenNodes;
  uvec4 hiddenEdges;
  vec4 labelPaper;
};
layout(std140) uniform States {
  vec4 stateNumbers[192];
  uvec4 statePaint[192];
  uvec4 stateLabel[192];
  uvec4 stateRaise;
  uvec4 stateOthers;
  uvec4 stateShapes;
};
uniform int layerSlot;
uniform int overlay;
uniform sampler2D palette;
const uint none = 0xffffffffu;
const vec4 hidden = vec4(2.0, 2.0, 2.0, 1.0);
const float worldTurn = 0.01227184630308513;
vec2 ringAt(float y) {
  float e = exp(clamp(3.14159265 - (y + globeInfo.y) * worldTurn, -30.0, 30.0));
  float f = 1.0 / e;
  return vec2(2.0, e - f) / (e + f);
}
vec3 spherePoint(vec2 world) {
  vec2 ring = ringAt(world.y);
  float lng = (world.x + globeInfo.x) * worldTurn - 3.14159265;
  return vec3(ring.x * sin(lng), ring.y, ring.x * cos(lng));
}
vec2 flatScreen(vec2 world) { return (world - center - centerLow) * zoom + viewport * 0.5; }
vec2 sphereScreen(vec3 p, vec2 flatPoint) {
  vec4 sphereClip = globeMatrix * vec4(p, 1.0);
  vec2 full = flatPoint - globeFrame.xy;
  float depth = globeInfo.w;
  vec4 flatClip = vec4((full.x / globeFrame.z * 2.0 - 1.0) * depth, (1.0 - full.y / globeFrame.w * 2.0) * depth, 0.0, depth);
  vec4 c = mix(flatClip, sphereClip, globeInfo.z);
  vec2 ndc = c.xy / c.w;
  return vec2((ndc.x + 1.0) * 0.5 * globeFrame.z, (1.0 - ndc.y) * 0.5 * globeFrame.w) + globeFrame.xy;
}
vec2 toScreen(vec2 world) {
  vec2 flatPoint = flatScreen(world);
  return globeInfo.z > 0.0 ? sphereScreen(spherePoint(world), flatPoint) : flatPoint;
}
float sideOf(vec3 p) { return dot(globePlane.xyz, p) + globePlane.w; }
float worldSide(vec2 world) { return globeInfo.z > 0.0 ? sideOf(spherePoint(world)) : 1.0; }
float scaleAt(vec2 world) {
  return globeInfo.z > 0.0 ? mix(zoom, globeMore.x * ringAt(world.y).x, globeInfo.z) : zoom;
}
vec4 toClip(vec2 screen) {
  return vec4(screen.x / viewport.x * 2.0 - 1.0, 1.0 - screen.y / viewport.y * 2.0, 0.0, 1.0);
}
ivec2 texel(uint index) { return ivec2(int(index & 1023u), int(index >> 10u)); }
bool anyHidden(uvec4 mask) { return (mask.x | mask.y | mask.z | mask.w) != 0u; }
bool slotHidden(uvec4 mask, uint slot) {
  if (slot >= 128u) return false;
  uint word = slot >> 5u;
  uint bits = word == 0u ? mask.x : word == 1u ? mask.y : word == 2u ? mask.z : mask.w;
  return (bits & (1u << (slot & 31u))) != 0u;
}
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
  uint rows = mask | (table == 0 ? stateOthers.x : table == 32 ? stateOthers.y : stateShapes.z);
  int others = table == 128 ? 160 : table + 64;
  for (int bit = 0; bit < 32; bit++) {
    if (rows == 0u) break;
    bool present = (rows & 1u) != 0u;
    int row = (mask & 1u) != 0u ? table + bit : others + bit;
    rows >>= 1u;
    mask >>= 1u;
    if (!present) continue;
    vec4 numbers = stateNumbers[row];
    uvec4 paint = statePaint[row];
    if (!opacity && numbers.x >= 0.0) { look.opacity = base * numbers.x; opacity = true; }
    if (!strokeWidth && numbers.y >= 0.0) { look.strokeWidth = numbers.y; strokeWidth = true; }
    if (!halo && numbers.z >= 0.0) { look.halo = numbers.z; halo = true; }
    if (!label && numbers.w >= 0.0) { look.label = numbers.w; label = true; }
    if (!fill && paint.x != none) { look.fill = paint.x; fill = true; }
    if (!stroke && paint.y != none) { look.stroke = paint.y; stroke = true; }
    if (!outline && paint.z != none) { look.outline = paint.z; outline = true; }
    if (!outlineWidth && paint.w != none) { look.outlineWidth = uintBitsToFloat(paint.w); outlineWidth = true; }
    uint text = stateLabel[row].x;
    if (!labelColor && text != none) { look.labelColor = text; labelColor = true; }
  }
  return look;
}
`

export const spanData: string = `
float zoomShown(vec2 range) {
  if (!(zoom > range.x && zoom < range.y)) return 0.0;
  float inside = min(range.x > 0.0 ? log2(zoom / range.x) : 1.0, log2(range.y / zoom));
  return clamp(inside / ${zoomFade.toFixed(2)}, 0.0, 1.0);
}
bool timeBefore(vec2 a, vec2 b) { return a.x < b.x || (a.x == b.x && a.y < b.y); }
bool timeSame(vec2 a, vec2 b) { return a.x == b.x && a.y == b.y; }
float timeShown(vec4 span) {
  vec2 s = span.xy;
  vec2 e = span.zw;
  vec2 ws = timeWindow.xy;
  vec2 we = timeWindow.zw;
  if (timeFade > 0.0) {
    if (!timeBefore(s, we) || !timeBefore(ws, e)) return 0.0;
    float inside = min((we.x - s.x) + (we.y - s.y), (e.x - ws.x) + (e.y - ws.y));
    return clamp(inside / timeFade, ${leastFade.toFixed(6)}, 1.0);
  }
  bool started = timeBefore(s, we) || (timePoint > 0.5 && timeSame(s, we));
  if (!started) return 0.0;
  return timeBefore(ws, e) || (timeSame(s, e) && timeSame(e, ws)) ? 1.0 : 0.0;
}
`

export const nodeSamplers: string = `
uniform sampler2D nodePosition;
uniform sampler2D nodeStyle;
uniform usampler2D nodeState;
uniform sampler2D nodeZoom;
uniform sampler2D nodeTime;
`

export const nodeSight: string = `
float nodeShown(ivec2 t) {
  if (anyHidden(hiddenNodes) && slotHidden(hiddenNodes, (uint(texelFetch(nodeStyle, t, 0).w + 0.5) >> 4u) & 255u)) return 0.0;
  if ((stateRaise.z | stateOthers.z) != 0u) {
    uint mask = texelFetch(nodeState, t, 0).r;
    if ((mask & stateRaise.z) != 0u || (~mask & stateOthers.z) != 0u) return 0.0;
  }
  float shown = ranged > 0.5 ? zoomShown(texelFetch(nodeZoom, t, 0).xy) : 1.0;
  return timed > 0.5 && shown > 0.0 ? shown * timeShown(texelFetch(nodeTime, t, 0)) : shown;
}
`

export const nodeData: string = `${nodeSamplers}${spanData}${nodeSight}float nodeDiameter(vec4 style, float scale) {
  uint flags = uint(style.w + 0.5);
  return (flags & 4u) != 0u ? style.x : style.x * scale;
}
float nodeRadius(vec4 style, float scale) { return max(nodeDiameter(style, scale) * 0.5, 1.25); }
bool boxStyle(vec4 style) { return (uint(style.w + 0.5) & ${boxFlag}u) != 0u; }
#ifndef NO_CONTAINER_ENDS
uniform sampler2D nodeBox;
#endif
vec4 nodeOutline(ivec2 t, vec4 style, float scale) {
#ifndef NO_CONTAINER_ENDS
  if ((uint(style.w + 0.5) & 3u) == 3u) {
    vec3 box = texelFetch(nodeBox, t, 0).xyz;
    vec2 extent = max(box.xy * scale, vec2(1.25));
    return vec4(extent, min(box.z * scale, min(extent.x, extent.y)), 1.0);
  }
#endif
  float radius = nodeRadius(style, scale);
  if (!boxStyle(style)) return vec4(radius, radius, radius, 0.0);
  vec2 box = texelFetch(nodeZoom, t, 0).zw;
  float unit = (uint(style.w + 0.5) & 4u) != 0u ? 1.0 : scale;
  float wide = max(box.x * 0.5 * unit, 1.25);
  return vec4(wide, radius, min(box.y * unit, min(wide, radius)), 1.0);
}
float outlineReach(vec4 outline, vec2 dir) {
  if (outline.w < 0.5) return outline.x;
  vec2 d = abs(dir);
  float t = min(d.x > 1e-6 ? outline.x / d.x : 1e30, d.y > 1e-6 ? outline.y / d.y : 1e30);
  if (t > 1e29) return outline.y;
  vec2 inner = outline.xy - outline.z;
  if (d.x * t > inner.x && d.y * t > inner.y) {
    float b = dot(d, inner);
    t = b + sqrt(max(b * b - dot(inner, inner) + outline.z * outline.z, 0.0));
  }
  return t;
}
float towardReach(vec4 outline, vec2 delta) {
  float span = length(delta);
  return outline.w < 0.5 || span < 1e-6 ? outline.y : outlineReach(outline, delta / span);
}
float outlineDistance(vec2 p, vec4 outline) {
  if (outline.w < 0.5) return length(p) - outline.x;
  vec2 q = abs(p) - outline.xy + outline.z;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - outline.z;
}
vec2 loopAnchor(vec4 outline) { return vec2(outline.w > 0.5 ? max(outline.x - outline.y, 0.0) : 0.0, 0.0); }
float badgeHeight(vec4 style, float scale) { return min(nodeDiameter(style, scale) * 0.55, ${badgeLimit.toFixed(1)}); }
vec2 badgeCenter(ivec2 t, vec2 xy, vec4 style, uint corner) {
  uint shape = uint(style.w + 0.5) & 3u;
  vec2 side = vec2((corner & 1u) != 0u ? 1.0 : -1.0, (corner & 2u) != 0u ? 1.0 : -1.0);
  float scale = scaleAt(xy);
  if (boxStyle(style)) {
    vec4 outline = nodeOutline(t, style, scale);
    return toScreen(xy) + side * (outline.xy - outline.z * ${boxBadgeInset.toFixed(6)});
  }
  float reach = shape == 0u ? 0.70710678 : shape == 1u ? 0.86 : 0.6;
  return toScreen(xy) + side * reach * nodeRadius(style, scale);
}
`

export const nodeLookData: string = `
uniform usampler2D nodePaint;
uniform usampler2D nodeDecor;
Look nodeLook(ivec2 t, vec4 style, uvec4 paint, uint mask) {
  float outlineWidth = uintBitsToFloat(texelFetch(nodeDecor, t, 0).w);
  Look look = resolve(mask, Look(style.z, style.y, 0.0, 1.0, paint.x, paint.y, paint.w, outlineWidth, none), 0);
  look.opacity *= nodeShown(t);
  return look;
}
`

export const edgeData: string = `
uniform usampler2D edgeTopology;
uniform sampler2D edgeStyle;
uniform usampler2D edgeState;
uniform sampler2D edgeZoom;
uniform sampler2D edgeTime;
uniform float flowTime;
float edgeShown(ivec2 t, uvec4 topology, uint mask) {
  bool layered = anyHidden(hiddenNodes) || anyHidden(hiddenEdges) || (stateRaise.z | stateRaise.w | stateOthers.z | stateOthers.w) != 0u;
  if (ranged < 0.5 && timed < 0.5 && !layered) return 1.0;
  if (slotHidden(hiddenEdges, topology.w >> 6u)) return 0.0;
  if ((mask & stateRaise.w) != 0u || (~mask & stateOthers.w) != 0u) return 0.0;
  float own = ranged > 0.5 ? zoomShown(texelFetch(edgeZoom, t, 0).xy) : 1.0;
  if (timed > 0.5 && own > 0.0) own *= timeShown(texelFetch(edgeTime, t, 0));
  return min(own, min(nodeShown(texel(topology.x)), nodeShown(texel(topology.y))));
}
float edgeFlow(uint mask, float speed) {
  uint rows = mask | stateOthers.y;
  for (int bit = 0; bit < 32; bit++) {
    if (rows == 0u) break;
    bool present = (rows & 1u) != 0u;
    int row = (mask & 1u) != 0u ? 32 + bit : 96 + bit;
    rows >>= 1u;
    mask >>= 1u;
    if (!present) continue;
    uint flow = stateLabel[row].y;
    if (flow != none) return uintBitsToFloat(flow);
  }
  return speed;
}
bool geodesicOf(uint packed) { return (packed & 32u) != 0u; }
float wrapDelta(float dx) { return dx > 256.0 ? dx - 512.0 : dx < -256.0 ? dx + 512.0 : dx; }
float arcRise(vec3 p, vec3 q) {
  float best = max(sideOf(p), sideOf(q));
  float c = clamp(dot(p, q), -1.0, 1.0);
  vec3 t = q - p * c;
  float span = length(t);
  if (span < 1e-7) return best;
  t /= span;
  float x = dot(globePlane.xyz, p);
  float y = dot(globePlane.xyz, t);
  float theta = atan(y, x);
  return theta > 0.0 && theta < acos(c) ? max(best, length(vec2(x, y)) + globePlane.w) : best;
}
int edgeRouteOf(vec2 a, vec2 d, vec3 p, vec3 q, bool geodesic) {
  bool globe = globeInfo.z > 0.0;
  if (!globe && !geodesic) return 0;
  vec2 delta = d - a;
  if (geodesic && abs(delta.x) > 256.0) return 1;
  vec2 ring = ringAt((a.y + d.y) * 0.5);
  if (globe && !geodesic && length(delta) * ring.x <= globeMore.y) return 0;
  float len = length(delta) * worldTurn;
  if (globe && (sideOf(p) < 0.0 || sideOf(q) < 0.0)) {
    if (!geodesic && abs(delta.x) > 128.0) return 1;
    float slack = geodesic ? 1e-4 : abs(delta.x * worldTurn) * len * 0.25 + 1e-4;
    return arcRise(p, q) + slack < 0.0 ? 2 : 1;
  }
  if (!geodesic) return 1;
  float bulge = abs(ring.y) * abs(delta.x * worldTurn) * len / 8.0 / worldTurn * zoom;
  float span = len * ring.x;
  if (globe) bulge += globeInfo.z * globeMore.x * span * span / 8.0 / worldTurn;
  return bulge > ${arcThreshold.toFixed(2)} ? 1 : 0;
}
int edgeRoute(vec2 a, vec2 d, bool geodesic) {
  bool globe = globeInfo.z > 0.0;
  vec3 p = globe ? spherePoint(a) : vec3(0.0);
  vec3 q = globe ? spherePoint(d) : vec3(0.0);
  return edgeRouteOf(a, d, p, q, geodesic);
}
struct Arc {
  vec2 a;
  vec2 d;
  float bend;
  bool geodesic;
  vec3 p;
  vec3 q;
  float omega;
  float sine;
  float lngA;
  float shiftX;
};
Arc arcOf(vec2 a, vec2 d, float bend, bool geodesic, float shiftX) {
  Arc arc;
  arc.a = a;
  arc.d = d;
  arc.bend = bend;
  arc.geodesic = geodesic;
  arc.shiftX = shiftX;
  arc.p = spherePoint(a);
  arc.q = spherePoint(d);
  arc.omega = acos(clamp(dot(arc.p, arc.q), -1.0, 1.0));
  arc.sine = sin(arc.omega);
  arc.lngA = atan(arc.p.x, arc.p.z);
  return arc;
}
vec2 arcWorld(Arc arc, float u, out vec3 sphere, out bool exact) {
  vec2 delta = arc.d - arc.a;
  vec2 world = mix(arc.a, arc.d, u);
  exact = false;
  if (arc.geodesic) {
    if (u <= 0.0) world = arc.a;
    else if (u >= 1.0) world = vec2(arc.a.x + wrapDelta(delta.x), arc.d.y);
    else if (arc.sine > 1e-6) {
      vec3 r = (sin((1.0 - u) * arc.omega) * arc.p + sin(u * arc.omega) * arc.q) / arc.sine;
      float turn = atan(r.x, r.z) - arc.lngA;
      turn -= 6.28318531 * floor((turn + 3.14159265) / 6.28318531);
      float sine = clamp(r.y, -0.9999999, 0.9999999);
      world = vec2(arc.a.x + turn / worldTurn, (0.5 - log((1.0 + sine) / (1.0 - sine)) / 12.56637061) * 512.0 - globeInfo.y);
      sphere = r;
      exact = arc.bend == 0.0 && arc.shiftX == 0.0;
    }
  }
  world += vec2(-delta.y, delta.x) * (arc.bend * 4.0 * u * (1.0 - u));
  world.x += arc.shiftX;
  return world;
}
vec2 arcScreen(Arc arc, float u, out float clip) {
  vec3 sphere = vec3(0.0);
  bool exact;
  vec2 world = arcWorld(arc, u, sphere, exact);
  vec2 flatPoint = flatScreen(world);
  if (globeInfo.z > 0.0) {
    if (!exact) sphere = spherePoint(world);
    clip = sideOf(sphere);
    return sphereScreen(sphere, flatPoint);
  }
  float x = world.x + globeInfo.x;
  clip = arc.geodesic ? min(x, 512.0 - x) : 1.0;
  return flatPoint;
}
`

export function withEnds(source: string): string {
  return source.replace('#version 300 es\n', '#version 300 es\n#define ENDS\n')
}

export const endData: string = `
#ifdef ENDS
uniform usampler2D edgeEnds;
uniform int edgeHalf;
#endif
const uint skipEdge = 3u;
uint edgeMask(ivec2 t) {
#ifdef ENDS
  uvec4 state = texelFetch(edgeState, t, 0);
  return edgeHalf == 1 ? state.g : state.r;
#else
  return texelFetch(edgeState, t, 0).r;
#endif
}
uint edgePart(ivec2 t, uint packed, uint mask) {
  if ((packed & 16u) == 0u || (overlay == 0 && int(packed >> 6u) != layerSlot)) return skipEdge;
  uint part = 0u;
#ifdef ENDS
  if (halved > 0.5) {
    bool halves = (texelFetch(edgeEnds, t, 0).w & ${endHalvesFlag}u) != 0u;
    part = halves ? uint(edgeHalf) + 1u : edgeHalf == 1 ? skipEdge : 0u;
  }
#endif
  bool highlighted = (mask & stateRaise.y) != 0u;
  if (part == skipEdge || (overlay == 0 && highlighted) || (overlay == 1 && part != 0u && !highlighted)) return skipEdge;
  return part;
}
struct Line { uint color; uint farColor; float width; float farWidth; uint dash; uint farDash; float split; };
Look lineLook(uint mask, vec4 style) {
  return resolve(mask, Look(style.y, -1.0, 0.0, 1.0, none, none, none, 0.0, none), 32);
}
Line edgeLine(ivec2 t, uvec4 topology, vec4 style, Look look, float flow) {
#ifdef ENDS
  uvec4 ends = texelFetch(edgeEnds, t, 0);
#else
  uvec4 ends = uvec4(0u);
#endif
  bool split = (ends.w & ${endSplitFlag}u) != 0u;
  bool painted = look.stroke != none;
  bool sized = look.strokeWidth >= 0.0;
  Line line;
  line.color = painted ? look.stroke : split ? ends.x : topology.z;
  line.farColor = painted || !split ? line.color : ends.y;
  line.width = max(sized ? look.strokeWidth : split ? float(ends.z & 65535u) / ${endWidthUnit.toFixed(1)} : style.x, 0.5);
  line.farWidth = sized || !split ? line.width : max(float(ends.z >> 16u) / ${endWidthUnit.toFixed(1)}, 0.5);
  uint dash = split ? (ends.w >> 16u) & 3u : topology.w & 3u;
  uint farDash = split ? (ends.w >> 18u) & 3u : dash;
  line.dash = dash == 0u && flow != 0.0 ? 1u : dash;
  line.farDash = farDash == 0u && flow != 0.0 ? 1u : farDash;
  line.split = split || (ends.w & ${endHalvesFlag}u) != 0u ? float(ends.w & 65535u) / 65535.0 : -1.0;
  return line;
}
#ifdef ENDS
vec3 splitOf(Line line, float start, float end, float endHead) {
  float at = line.split < 0.0 ? 3.0e38 : mix(start, end, line.split);
  return vec3(at, line.farWidth * 0.5, endHead);
}
uint packColor(vec4 color) {
  uvec4 bytes = uvec4(round(clamp(color, 0.0, 1.0) * 255.0));
  return bytes.r | (bytes.g << 8u) | (bytes.b << 16u) | (bytes.a << 24u);
}
#endif
`

export const curveData: string = `
vec2 cubicAt(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d;
}
vec2 cubicTangent(vec2 a, vec2 b, vec2 c, vec2 d, float t) {
  float u = 1.0 - t;
  return 3.0 * u * u * (b - a) + 6.0 * u * t * (c - b) + 3.0 * t * t * (d - c);
}
float crossing(vec2 a, vec2 b, vec2 c, vec2 d, vec2 point, vec4 outline, float lo, float hi, bool rising) {
  for (int i = 0; i < 14; i++) {
    float mid = (lo + hi) * 0.5;
    bool inside = outlineDistance(cubicAt(a, b, c, d, mid) - point, outline) < 0.0;
    if (inside == rising) lo = mid; else hi = mid;
  }
  return (lo + hi) * 0.5;
}
`

export const nodeVertex: string = `${header}${nodeData}${nodeLookData}
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
  bool highlighted = (mask & stateRaise.x) != 0u;
  bool container = (flags & 3u) == 3u;
  if ((flags & 8u) == 0u || container != (overlay == 2) || (overlay == 0 && (int(paint.z) != layerSlot || highlighted))) {
    gl_Position = hidden;
    return;
  }
  Look look = nodeLook(t, style, paint, mask);
  if (look.opacity <= 0.0) {
    gl_Position = hidden;
    return;
  }
  vec2 xy = texelFetch(nodePosition, t, 0).xy;
  if (worldSide(xy) < 0.0) {
    gl_Position = hidden;
    return;
  }
  float scale = scaleAt(xy);
  float radius = nodeRadius(style, scale);
  vec2 extent = vec2(radius);
  bool boxed = !container && boxStyle(style);
  vBox = vec3(0.0);
  if (container) {
    vec4 box = texelFetch(nodeBox, t, 0);
    extent = max(box.xy * scale, vec2(1.25));
    radius = min(extent.x, extent.y);
    vBox = vec3(extent, min(box.z * scale, radius));
  } else if (boxed) {
    vec4 outline = nodeOutline(t, style, scale);
    extent = outline.xy;
    radius = min(extent.x, extent.y);
    vBox = outline.xyz;
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
  vRadius = boxed ? extent.y : radius;
  vStrokeWidth = min(look.strokeWidth, radius * 0.5);
  vHaloWidth = halo;
  vOutlineWidth = outline;
  vOutline = paletteColor(look.outline);
  vShape = boxed ? 3u : flags & 3u;
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

export function edgeVertexOf(bridged: boolean): string {
  return `${header}${nodeData}${edgeData}${endData}${bundlePath}${bridged ? bridgeData : ''}
layout(location = 0) in vec3 corner;
layout(location = 1) in uint instance;
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
  uint mask = edgeMask(t);
  uint part = edgePart(t, packed, mask);
  if (part == skipEdge || topology.x == topology.y || style.z != 0.0 || pathOf(instance).y > 1u) {
    gl_Position = hidden;
    return;
  }
  Look look = lineLook(mask, style);
  look.opacity *= edgeShown(t, topology, mask);
  if (look.opacity <= 0.0) {
    gl_Position = hidden;
    return;
  }
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 a0 = texelFetch(nodePosition, s, 0).xy;
  vec2 d0 = texelFetch(nodePosition, e, 0).xy;
  bool globe = globeInfo.z > 0.0;
  vec3 pa = globe ? spherePoint(a0) : vec3(0.0);
  vec3 pd = globe ? spherePoint(d0) : vec3(0.0);
  float sa = globe ? sideOf(pa) : 1.0;
  float sd = globe ? sideOf(pd) : 1.0;
  if ((sa < 0.0 && sd < 0.0) || edgeRouteOf(a0, d0, pa, pd, geodesicOf(packed)) != 0) {
    gl_Position = hidden;
    return;
  }
  vec2 ps = globe ? sphereScreen(pa, flatScreen(a0)) : flatScreen(a0);
  vec2 pt = globe ? sphereScreen(pd, flatScreen(d0)) : flatScreen(d0);
  float flow = edgeFlow(mask, style.w);
  Line line = edgeLine(t, topology, style, look, flow);
  float width = max(line.width, line.farWidth);
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
  float start = outlineReach(nodeOutline(s, texelFetch(nodeStyle, s, 0), scaleAt(a0)), dir);
  float end = len - outlineReach(nodeOutline(e, texelFetch(nodeStyle, e, 0), scaleAt(d0)), dir);
  float visible = end - start;
  uint arrow = (packed >> 2u) & 3u;
  float startHead = (arrow & 1u) != 0u && visible > line.width * 8.0 ? max(line.width * 4.0, 6.0) : 0.0;
  float endHead = (arrow & 2u) != 0u && visible > line.farWidth * 8.0 ? max(line.farWidth * 4.0, 6.0) : 0.0;
  bool dotted = line.dash == 2u || line.farDash == 2u;
  float body = (dotted ? max(width * 0.6, 1.0) : width * 0.5) + halo + margin;
  head = max(body, head);${bridged ? straightBridges : ''}
  float along = corner.x < 0.5 ? start - margin
    : corner.x < 1.5 ? start + startHead
    : corner.x < 2.5 ? end - endHead
    : end + margin;
  if (part != 0u) {
    float cut = mix(start, end, line.split);
    along = part == 1u ? min(along, max(cut, start + startHead) + margin) : max(along, min(cut, end - endHead) - margin);
  }
  float extent = corner.z < 0.5 ? body
    : corner.z < 1.5 ? (startHead > 0.0 && part != 2u ? head : body)
    : (endHead > 0.0 && part != 1u ? head : body);
  float across = corner.y * extent;
  vPos = vec2(along, across);
  vClip = len > 0.0 ? mix(sa, sd, along / len) : 1.0;
  vStart = start;
  vEnd = end;
  vHalfWidth = line.width * 0.5;
  vArrowLength = (arrow & 1u) != 0u ? startHead : endHead;
  vArrowHalf = max(line.width * 1.6, 3.0);
  vHaloWidth = halo;
  vDash = line.dash | (line.farDash << 2u) | (part << 4u);
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
  gl_Position = visible > 0.5 ? toClip(ps + dir * along + normal * across) : hidden;
}
`
}

export const edgeVertex: string = edgeVertexOf(false)

const segments = curveSegments.toFixed(1)

export const curveVertex: string = `${header}${nodeData}${edgeData}${endData}${curveData}${bundlePath}
layout(location = 0) in vec3 corner;
layout(location = 1) in uint instance;
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
#ifdef ENDS
flat out uint vNear;
flat out uint vFar;
flat out vec3 vSplit;
#else
flat out vec4 vColor;
#endif
flat out float vOpacity;
flat out float vFlow;
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
  uint mask = edgeMask(t);
  bool loop = topology.x == topology.y;
  uint part = edgePart(t, packed, mask);
  if (part == skipEdge || (!loop && style.z == 0.0) || pathOf(instance).y > 1u) {
    gl_Position = hidden;
    return;
  }
  Look look = lineLook(mask, style);
  look.opacity *= edgeShown(t, topology, mask);
  if (look.opacity <= 0.0) {
    gl_Position = hidden;
    return;
  }
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 a0 = texelFetch(nodePosition, s, 0).xy;
  vec2 d0 = texelFetch(nodePosition, e, 0).xy;
  bool globe = globeInfo.z > 0.0;
  vec3 pa = globe ? spherePoint(a0) : vec3(0.0);
  vec3 pd = globe ? spherePoint(d0) : vec3(0.0);
  float sa = globe ? sideOf(pa) : 1.0;
  float sd = globe ? sideOf(pd) : 1.0;
  if (loop ? sa < 0.0 : (sa < 0.0 && sd < 0.0) || edgeRouteOf(a0, d0, pa, pd, geodesicOf(packed)) != 0) {
    gl_Position = hidden;
    return;
  }
  vec2 a = globe ? sphereScreen(pa, flatScreen(a0)) : flatScreen(a0);
  vec2 d = globe ? sphereScreen(pd, flatScreen(d0)) : flatScreen(d0);
  vec4 sourceOutline = nodeOutline(s, texelFetch(nodeStyle, s, 0), scaleAt(a0));
  vec4 targetOutline = nodeOutline(e, texelFetch(nodeStyle, e, 0), scaleAt(d0));
  float sourceRadius = sourceOutline.y;
  vec2 sourceCenter = a;
  vec2 targetCenter = d;
  vec2 b;
  vec2 c;
  if (loop) {
    a += loopAnchor(sourceOutline);
    d = a;
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
  float flow = edgeFlow(mask, style.w);
  Line line = edgeLine(t, topology, style, look, flow);
  float width = max(line.width, line.farWidth);
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
  float t0 = crossing(a, b, c, d, sourceCenter, sourceOutline, 0.0, 0.5, true);
  float t1 = crossing(a, b, c, d, targetCenter, targetOutline, 0.5, 1.0, false);
  float visible = arcLength(a, b, c, d, t0, t1);
  uint arrow = (packed >> 2u) & 3u;
  float startHead = (arrow & 1u) != 0u && visible > line.width * 8.0 ? max(line.width * 4.0, 6.0) : 0.0;
  float endHead = (arrow & 2u) != 0u && visible > line.farWidth * 8.0 ? max(line.farWidth * 4.0, 6.0) : 0.0;
  vec2 first = cubicAt(a, b, c, d, t0);
  vec2 last = cubicAt(a, b, c, d, t1);
  float ta = startHead > 0.0 ? crossing(a, b, c, d, first, vec4(startHead, startHead, 0.0, 0.0), t0, t1, true) : t0;
  float tb = endHead > 0.0 ? crossing(a, b, c, d, last, vec4(endHead, endHead, 0.0, 0.0), t0, t1, false) : t1;
  bool dotted = line.dash == 2u || line.farDash == 2u;
  float body = (dotted ? max(width * 0.6, 1.0) : width * 0.5) + halo + margin;
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
  vClip = loop ? 1.0 : mix(sa, sd, at);
  vStart = 0.0;
  vEnd = visible;
  vHalfWidth = line.width * 0.5;
  vArrowLength = (arrow & 1u) != 0u ? startHead : endHead;
  vArrowHalf = max(line.width * 1.6, 3.0);
  vHaloWidth = halo;
  vDash = line.dash | (line.farDash << 2u) | (part << 4u);
  vFlow = flow * flowTime;
  vArrow = arrow;
#ifdef ENDS
  vNear = packColor(paletteColor(line.color));
  vFar = line.farColor == line.color ? vNear : packColor(paletteColor(line.farColor));
  vSplit = splitOf(line, 0.0, visible, endHead);
#else
  vColor = paletteColor(line.color);
#endif
  vOpacity = look.opacity;
  gl_Position = visible > 0.5 ? toClip(cubicAt(a, b, c, d, at) + dir * push + normal * across) : hidden;
}
`

export function edgeFragmentOf(clipped: boolean, bridged = false): string {
  return `${header}${bridged ? bridgeFragment : ''}
in vec2 vPos;${clipped ? '\nin float vClip;' : ''}
flat in float vStart;
flat in float vEnd;
flat in float vHalfWidth;
flat in float vArrowLength;
flat in float vArrowHalf;
flat in float vHaloWidth;
flat in uint vDash;
flat in uint vArrow;
#ifdef ENDS
flat in uint vNear;
flat in uint vFar;
flat in vec3 vSplit;
vec4 unpackColor(uint packed) {
  return vec4(uvec4(packed, packed >> 8u, packed >> 16u, packed >> 24u) & 255u) / 255.0;
}
#else
flat in vec4 vColor;
#endif
flat in float vOpacity;
flat in float vFlow;
out vec4 fragColor;
void main() {${clipped ? '\n  if (vClip < 0.0) discard;' : ''}
  float aa = 0.5 / pixelRatio + 0.25;
  float along = vPos.x;
  float halfWidth = vHalfWidth;
  float lineWidth = vHalfWidth;
  uint dash = vDash & 3u;
  bool head = false;
#ifdef ENDS
  bool far = along >= vSplit.x;
  if (far) {
    halfWidth = vSplit.y;
    dash = (vDash >> 2u) & 3u;
  }
  lineWidth = max(vHalfWidth, vSplit.y);
  if ((vArrow & 2u) != 0u && vSplit.z > 0.0 && along > vEnd - vSplit.z) {
    halfWidth = max(vSplit.y * 3.2, 3.0) * (vEnd - along) / vSplit.z;
    head = true;
    far = true;
  }
  if ((vArrow & 1u) != 0u && vArrowLength > 0.0 && along < vStart + vArrowLength) {
    halfWidth = vArrowHalf * (along - vStart) / vArrowLength;
    head = true;
    far = false;
  }
  uint part = vDash >> 4u;
  if ((part == 1u && far) || (part == 2u && !far)) discard;
  vec4 color = unpackColor(far ? vFar : vNear);
#else
  vec4 color = vColor;
  if ((vArrow & 2u) != 0u && vArrowLength > 0.0 && along > vEnd - vArrowLength) {
    halfWidth = vArrowHalf * (vEnd - along) / vArrowLength;
    head = true;
  }
  if ((vArrow & 1u) != 0u && vArrowLength > 0.0 && along < vStart + vArrowLength) {
    halfWidth = vArrowHalf * (along - vStart) / vArrowLength;
    head = true;
  }
#endif
  float keep = 1.0;
  float across = ${bridged ? 'bridgeAcross(along, vPos.y, aa, keep)' : 'abs(vPos.y)'};
  float span = smoothstep(vStart - aa, vStart + aa, along) * (1.0 - smoothstep(vEnd - aa, vEnd + aa, along)) * keep;
  float coverage = (1.0 - smoothstep(halfWidth - aa, halfWidth + aa, across)) * span;
  if (!head && dash != 0u) {
    float width = lineWidth * 2.0;
    float offset = along - vStart - vFlow;
    if (dash == 1u) {
      float period = max(width * 5.0, 8.0);
      float m = mod(offset, period);
      coverage *= smoothstep(0.0, aa, m) * (1.0 - smoothstep(period * 0.6 - aa, period * 0.6 + aa, m));
    } else {
      float period = max(width * 2.5, 4.0);
      float m = mod(offset, period) - period * 0.5;
      float radius = max(halfWidth * 1.2, 1.0);
      coverage = (1.0 - smoothstep(radius - aa, radius + aa, length(vec2(m, across)))) * span;
    }
  }
  float alpha = color.a * coverage * vOpacity;
  vec4 result = vec4(color.rgb * alpha, alpha);
  if (vHaloWidth > 0.0) {
    float distance = max(across - halfWidth, 0.0);
    float h = haloColor.a * (1.0 - smoothstep(0.0, vHaloWidth, distance)) * span * vOpacity;
    result += vec4(haloColor.rgb * h, h) * (1.0 - result.a);
  }
  fragColor = result;
}
`
}

export const edgeFragment: string = edgeFragmentOf(false)
export const clippedEdgeFragment: string = edgeFragmentOf(true)

export const glyphLayout: string = `
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
float linearChannel(float c) { return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4); }
float luminanceOf(vec3 c) {
  return 0.2126 * linearChannel(c.r) + 0.7152 * linearChannel(c.g) + 0.0722 * linearChannel(c.b);
}
float contrastOf(float a, float b) { return (max(a, b) + 0.05) / (min(a, b) + 0.05); }
bool paperOnFill(vec4 fill) {
  float below = luminanceOf(mix(labelPaper.rgb, fill.rgb, fill.a));
  return contrastOf(below, luminanceOf(labelPaper.rgb)) > contrastOf(below, luminanceOf(labelInk.rgb));
}
vec2 layoutGlyph(uint kind, float pixels, float lift, uint stateColor, uint inside) {
  bool paper = inside == 2u;
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
    : paper ? vec4(labelPaper.rgb, labelPaper.a * (kind == 0u ? 1.0 : ${mutedPaper.toFixed(2)}))
    : kind == 0u ? labelInk : labelMuted;
  vHalo = (glyphKind & 4u) != 0u || inside != 0u ? 0.0 : 1.0;
  return (glyphRect.xy + corner * glyphRect.zw) * scale - vec2(0.0, lift);
}
`

export const labelVertex: string = `${header}${nodeData}${nodeLookData}${edgeData}${curveData}${bundlePath}${glyphLayout}vec4 fixedMiddle(uvec4 path, vec2 a, vec2 d, vec2 wraps, float shift) {
  int inner = int(path.y) - 2;
  vec2 p = fixedPoint(path, 1, a, d, wraps);
  vec2 q = fixedPoint(path, inner, a, d, wraps);
  vec2 e = fixedPoint(path, inner + 1, a, d, wraps);
  float head = distance(a, p);
  float body = uintBitsToFloat(path.z);
  float tail = distance(q, e);
  float total = head + body + tail;
  float goal = clamp((total + shift) * 0.5, 0.0, total);
  vec2 from = a;
  vec2 to = p;
  float t = head > 0.0 ? goal / head : 0.0;
  if (goal > head && goal < head + body && inner > 1) {
    float target = goal - head;
    int lo = 0;
    int hi = inner - 1;
    for (int iteration = 0; iteration < 14; iteration++) {
      if (hi - lo <= 1) break;
      int mid = (lo + hi) / 2;
      if (fixedTexel(path, mid).z <= target) lo = mid;
      else hi = mid;
    }
    vec4 left = fixedTexel(path, lo);
    vec4 right = fixedTexel(path, hi);
    from = left.xy - vec2(wraps.x, 0.0);
    to = right.xy - vec2(wraps.x, 0.0);
    t = right.z > left.z ? (target - left.z) / (right.z - left.z) : 0.0;
  } else if (goal >= head + body) {
    from = q;
    to = e;
    t = tail > 0.0 ? (goal - head - body) / tail : 1.0;
  }
  return vec4(mix(from, to, clamp(t, 0.0, 1.0)), to - from);
}
vec2 upright(vec2 dir) {
  return dir.x < -${uprightSlack.toFixed(4)} || (abs(dir.x) <= ${uprightSlack.toFixed(4)} && dir.y < 0.0) ? -dir : dir;
}
vec4 endSpot(bool first, float reach, vec2 a0, vec2 d0, vec2 a, vec2 d, float bend, uvec4 path, int route, bool loop, bool geodesic, float sourceRadius) {
  vec2 center = first ? a : d;
  if (route == 1 || path.y > 1u) {
    int count = route == 1 ? 17 : int(path.y);
    Arc arc = arcOf(a0, d0, bend, geodesic, first ? 0.0 : d0.x - a0.x - wrapDelta(d0.x - a0.x));
    vec2 wraps = fixedPath(path) ? fixedWraps(path, a0, d0) : vec2(0.0);
    vec2 copy = first ? vec2(0.0) : vec2(wraps.x - wraps.y, 0.0);
    vec2 previous = center;
    float before = 0.0;
    for (int k = 1; k < 64; k++) {
      if (k >= count) break;
      int at = first ? k : count - 1 - k;
      float clip;
      vec2 point = route == 1 ? arcScreen(arc, float(at) / float(count - 1), clip) : toScreen(anyPathPoint(path, at, a0, d0, bend, wraps) + copy);
      float gap = length(point - center);
      if (gap >= reach || k == count - 1) {
        float f = gap > before ? clamp((reach - before) / (gap - before), 0.0, 1.0) : 1.0;
        vec2 step = first ? point - previous : previous - point;
        return vec4(mix(previous, point, f), step / max(length(step), 1e-6));
      }
      previous = point;
      before = gap;
    }
    return vec4(center, 1.0, 0.0);
  }
  if (loop || bend != 0.0) {
    vec2 b;
    vec2 c;
    if (loop) {
      float apex = sourceRadius + max(sourceRadius * 1.5, ${loopMinimum.toFixed(1)}) * (1.0 + ${loopGrowth.toFixed(2)} * bend);
      float arm = apex / (0.75 * cos(${loopTurn.toFixed(4)}));
      float cs = cos(${loopTurn.toFixed(4)});
      float sn = sin(${loopTurn.toFixed(4)});
      vec2 u = vec2(0.70710678, -0.70710678);
      b = a + arm * vec2(u.x * cs - u.y * sn, u.x * sn + u.y * cs);
      c = a + arm * vec2(u.x * cs + u.y * sn, -u.x * sn + u.y * cs);
    } else {
      vec2 delta = d - a;
      float len = length(delta);
      vec2 side = len > 0.0 ? vec2(-delta.y, delta.x) / len : vec2(0.0, 1.0);
      vec2 control = (a + d) * 0.5 + side * (2.0 * bend * len);
      b = a + (control - a) * (2.0 / 3.0);
      c = d + (control - d) * (2.0 / 3.0);
    }
    vec4 circle = vec4(reach, reach, 0.0, 0.0);
    float at = first ? crossing(a, b, c, d, a, circle, 0.0, 0.5, true) : crossing(a, b, c, d, d, circle, 0.5, 1.0, false);
    vec2 tangent = cubicTangent(a, b, c, d, at);
    return vec4(cubicAt(a, b, c, d, at), tangent / max(length(tangent), 1e-6));
  }
  vec2 delta = d - a;
  float len = length(delta);
  vec2 dir = len > 0.0 ? delta / len : vec2(1.0, 0.0);
  return vec4(first ? a + dir * reach : d - dir * reach, dir);
}
void edgeGlyph(uint kind) {
  ivec2 t = texel(glyphNode);
  uvec4 topology = texelFetch(edgeTopology, t, 0);
  vec4 style = texelFetch(edgeStyle, t, 0);
  uint mask = texelFetch(edgeState, t, 0).r;
  uint end = (glyphKind >> 4u) & 3u;
  float base = end == 0u ? style.x : float(glyphKind >> 20u) / ${endLabelWidthUnit.toFixed(1)};
  Look look = resolve(mask, Look(style.y, base, 0.0, 1.0, none, topology.z, none, 0.0, none), 32);
  look.opacity *= edgeShown(t, topology, mask);
  if (look.opacity <= 0.0) {
    gl_Position = hidden;
    return;
  }
  float pixels = glyphSize * min(1.0, zoom);
  if (look.label > 1.5) pixels = max(pixels, min(glyphSize, labelMin));
  if ((topology.w & 16u) == 0u || look.label < 0.5 || (pixels < labelMin && look.label < 1.5)) {
    gl_Position = hidden;
    return;
  }
  vOpacity = look.opacity;
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 a0 = texelFetch(nodePosition, s, 0).xy;
  vec2 d0 = texelFetch(nodePosition, e, 0).xy;
  vec2 a = toScreen(a0);
  vec4 sourceOutline = nodeOutline(s, texelFetch(nodeStyle, s, 0), scaleAt(a0));
  vec4 targetOutline = nodeOutline(e, texelFetch(nodeStyle, e, 0), scaleAt(d0));
  vec2 chord = toScreen(d0) - a;
  float sourceRadius = sourceOutline.y;
  vec2 spot;
  vec2 axis;
  uvec4 path = pathOf(glyphNode);
  bool loop = topology.x == topology.y;
  if (loop && worldSide(a0) < 0.0) {
    gl_Position = hidden;
    return;
  }
  int route = loop || path.y > 1u ? 0 : edgeRoute(a0, d0, geodesicOf(topology.w));
  if (route == 2) {
    gl_Position = hidden;
    return;
  }
  if (end != 0u) {
    vec2 near = end == 1u ? a0 : d0;
    if (worldSide(near) < 0.0) {
      gl_Position = hidden;
      return;
    }
    float radius = towardReach(end == 1u ? sourceOutline : targetOutline, chord);
    float width = max(look.strokeWidth, 0.5);
    bool headed = (((topology.w >> 2u) & 3u) & end) != 0u;
    float extent = float((glyphKind >> 8u) & 4095u) * pixels / atlasFontSize;
    float reach = radius + ${endLabelGap.toFixed(1)} + (headed ? max(width * 4.0, 6.0) : 0.0) + extent;
    vec2 origin = loop ? a + loopAnchor(sourceOutline) : a;
    vec4 found = endSpot(end == 1u, reach, a0, d0, origin, loop ? origin : toScreen(d0), style.z, path, route, loop, geodesicOf(topology.w), sourceRadius);
    spot = found.xy;
    axis = upright(found.zw);
  } else if (route == 1) {
    Arc arc = arcOf(a0, d0, style.z, geodesicOf(topology.w), 0.0);
    float clip;
    float before;
    float after;
    spot = arcScreen(arc, 0.5, clip);
    vec2 tangent = arcScreen(arc, ${(0.5 + 1 / 16).toFixed(4)}, after) - arcScreen(arc, ${(0.5 - 1 / 16).toFixed(4)}, before);
    if (clip < 0.0) {
      gl_Position = hidden;
      return;
    }
    float tangentLength = length(tangent);
    vec2 dir = tangentLength > 0.0 ? tangent / tangentLength : vec2(1.0, 0.0);
    axis = dir.x < -${uprightSlack.toFixed(4)} || (abs(dir.x) <= ${uprightSlack.toFixed(4)} && dir.y < 0.0) ? -dir : dir;
  } else if (fixedPath(path)) {
    vec2 wraps = fixedWraps(path, a0, d0);
    vec2 first = toScreen(fixedPoint(path, 1, a0, d0, wraps)) - a;
    vec2 last = toScreen(fixedPoint(path, int(path.y) - 1, a0, d0, wraps)) - toScreen(fixedPoint(path, int(path.y) - 2, a0, d0, wraps));
    float shift = (towardReach(sourceOutline, first) - towardReach(targetOutline, -last)) / scaleAt(a0);
    vec4 middle = fixedMiddle(path, a0, d0, wraps, shift);
    if (worldSide(middle.xy) < 0.0) {
      gl_Position = hidden;
      return;
    }
    spot = toScreen(middle.xy);
    vec2 tangent = toScreen(middle.xy + middle.zw * 0.01) - toScreen(middle.xy - middle.zw * 0.01);
    float tangentLength = length(tangent);
    vec2 dir = tangentLength > 0.0 ? tangent / tangentLength : vec2(1.0, 0.0);
    axis = upright(dir);
  } else if (path.y > 1u) {
    int middle = (int(path.y) - 1) / 2;
    spot = toScreen(pathPoint(path, middle, a0, d0, style.z));
    vec2 tangent = toScreen(pathPoint(path, middle + 1, a0, d0, style.z)) - toScreen(pathPoint(path, middle - 1, a0, d0, style.z));
    float tangentLength = length(tangent);
    vec2 dir = tangentLength > 0.0 ? tangent / tangentLength : vec2(1.0, 0.0);
    axis = dir.x < -${uprightSlack.toFixed(4)} || (abs(dir.x) <= ${uprightSlack.toFixed(4)} && dir.y < 0.0) ? -dir : dir;
  } else if (loop) {
    float reach = sourceRadius + max(sourceRadius * 1.5, ${loopMinimum.toFixed(1)}) * (1.0 + ${loopGrowth.toFixed(2)} * style.z);
    spot = a + loopAnchor(sourceOutline) + reach * vec2(0.70710678, -0.70710678);
    axis = vec2(0.70710678, 0.70710678);
  } else {
    vec2 d = toScreen(d0);
    vec2 delta = d - a;
    float len = length(delta);
    vec2 dir = len > 0.0 ? delta / len : vec2(1.0, 0.0);
    float shift = outlineReach(sourceOutline, dir) - outlineReach(targetOutline, dir);
    spot = (a + d) * 0.5 + dir * (shift * 0.5) + vec2(-dir.y, dir.x) * (style.z * len);
    axis = dir.x < -${uprightSlack.toFixed(4)} || (abs(dir.x) <= ${uprightSlack.toFixed(4)} && dir.y < 0.0) ? -dir : dir;
  }
  vec2 across = vec2(-axis.y, axis.x);
  float lift = (glyphKind & 4u) != 0u ? 0.0 : max(look.strokeWidth, 0.5) * 0.5 + ${edgeLabelGap.toFixed(1)};
  vec2 local = layoutGlyph(kind, pixels, lift, look.labelColor, 0u);
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
    bool highlighted = (mask & stateRaise.x) != 0u;
    vec2 xy = texelFetch(nodePosition, t, 0).xy;
    float height = badgeHeight(style, scaleAt(xy));
    if ((flags & 8u) == 0u || highlighted != (overlay == 1) || height < ${badgeTextMin.toFixed(1)} || worldSide(xy) < 0.0) {
      gl_Position = hidden;
      return;
    }
    float font = height * ${badgeFont.toFixed(2)};
    vec2 center = badgeCenter(t, xy, style, (glyphKind >> 2u) & 3u);
    vScale = font / atlasFontSize;
    vInk = paletteColor(glyphColor);
    vHalo = 0.0;
    gl_Position = toClip(center - vec2(0.0, font * 0.65) + (glyphRect.xy + corner * glyphRect.zw) * vScale);
    return;
  }
  float pixels = glyphSize * ((flags & 4u) != 0u ? 1.0 : min(1.0, zoom));
  if (look.label > 1.5) pixels = max(pixels, min(glyphSize, labelMin));
  vec2 xy = texelFetch(nodePosition, t, 0).xy;
  if ((flags & 8u) == 0u || look.label < 0.5 || (pixels < labelMin && look.label < 1.5) || worldSide(xy) < 0.0) {
    gl_Position = hidden;
    return;
  }
  uint placement = (glyphKind >> 4u) & 7u;
  vec2 dir = placement == 0u ? vec2(0.0, 1.0)
    : placement == 1u ? vec2(0.0, -1.0)
    : placement == 2u ? vec2(1.0, 0.0)
    : placement == 3u ? vec2(-1.0, 0.0)
    : vec2(0.0);
  float scale = scaleAt(xy);
  vec2 extent = nodeOutline(t, style, scale).xy;
  if ((flags & 3u) == 3u) extent = texelFetch(nodeBox, t, 0).xy * scale;
  float edge = abs(dir.x) > 0.5 ? extent.x : extent.y;
  float reach = placement == 4u ? 0.0 : edge + max(look.outlineWidth, 0.0) + ${labelGap.toFixed(1)};
  vec2 anchor = toScreen(xy) + dir * reach;
  bool inside = (glyphKind & ${insideGlyph}u) != 0u;
  uint fill = !inside ? 0u : look.labelColor == none && paperOnFill(paletteColor(look.fill)) ? 2u : 1u;
  gl_Position = toClip(anchor + layoutGlyph(kind, pixels, 0.0, look.labelColor, fill));
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

export const badgeVertex: string = `${header}${nodeData}${nodeLookData}
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
  bool highlighted = (mask & stateRaise.x) != 0u;
  vec2 xy = texelFetch(nodePosition, t, 0).xy;
  float height = badgeHeight(style, scaleAt(xy));
  if ((flags & 8u) == 0u || highlighted != (overlay == 1) || height < ${badgeMin.toFixed(1)} || worldSide(xy) < 0.0) {
    gl_Position = hidden;
    return;
  }
  Look look = nodeLook(t, style, paint, mask);
  if (look.opacity <= 0.0) {
    gl_Position = hidden;
    return;
  }
  bool text = (badgeInfo & 4u) != 0u && height >= ${badgeTextMin.toFixed(1)};
  float font = height * ${badgeFont.toFixed(2)};
  float width = text ? max(height, badgeText * font / ${atlasFontSize.toFixed(1)} + height * 0.6) : height;
  vec2 center = badgeCenter(t, xy, style, badgeInfo & 3u);
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

export const lensVertex: string = `#version 300 es
precision highp float;
uniform vec4 lensBox;
uniform vec2 lensCanvas;
in vec2 corner;
out vec2 vPixel;
void main() {
  vPixel = lensBox.xy + corner * lensBox.w;
  gl_Position = vec4(vPixel / lensCanvas * 2.0 - 1.0, 0.0, 1.0);
}
`

export const lensFragment: string = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D lensImage;
uniform vec4 lensBox;
uniform ivec2 lensOrigin;
uniform vec2 lensRing;
uniform vec4 lensColors[3];
in vec2 vPixel;
out vec4 fragColor;
vec4 premultiply(vec4 color) { return vec4(color.rgb * color.a, color.a); }
void main() {
  float d = distance(vPixel, lensBox.xy);
  float radius = lensBox.z;
  float aa = lensRing.y;
  ivec2 size = textureSize(lensImage, 0);
  ivec2 at = clamp(ivec2(gl_FragCoord.xy) - lensOrigin, ivec2(0), size - 1);
  vec4 content = texelFetch(lensImage, at, 0);
  vec4 body = content + premultiply(lensColors[0]) * (1.0 - content.a);
  float t = clamp((d - radius) / max(lensBox.w - radius, 1.0), 0.0, 1.0);
  vec4 shadow = premultiply(vec4(lensColors[2].rgb, lensColors[2].a * (1.0 - t) * (1.0 - t)));
  float inside = 1.0 - smoothstep(radius - aa, radius + aa, d);
  vec4 base = mix(shadow, body, inside);
  float ring = (1.0 - smoothstep(lensRing.x * 0.5 - aa, lensRing.x * 0.5 + aa, abs(d - radius)));
  vec4 edge = premultiply(vec4(lensColors[1].rgb, lensColors[1].a * ring));
  vec4 result = edge + base * (1.0 - edge.a);
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
