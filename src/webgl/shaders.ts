const header = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
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
};
layout(std140) uniform States {
  vec4 stateNumbers[32];
  uvec4 statePaint[32];
};
uniform int layerSlot;
uniform int overlay;
uniform sampler2D palette;
const uint highlightMask = 3u;
const uint none = 0xffffffffu;
const vec4 hidden = vec4(2.0, 2.0, 2.0, 1.0);
vec2 toScreen(vec2 world) { return (world - center) * zoom + viewport * 0.5; }
vec4 toClip(vec2 screen) {
  return vec4(screen.x / viewport.x * 2.0 - 1.0, 1.0 - screen.y / viewport.y * 2.0, 0.0, 1.0);
}
ivec2 texel(uint index) { return ivec2(int(index & 1023u), int(index >> 10u)); }
vec4 paletteColor(uint id) { return texelFetch(palette, ivec2(int(id & 255u), int(id >> 8u)), 0); }
struct Look { float opacity; float strokeWidth; float halo; float label; uint fill; uint stroke; };
Look resolve(uint mask, Look look) {
  bool opacity = false;
  bool strokeWidth = false;
  bool halo = false;
  bool label = false;
  bool fill = false;
  bool stroke = false;
  float base = look.opacity;
  for (int bit = 0; bit < 32; bit++) {
    if (mask == 0u) break;
    bool present = (mask & 1u) != 0u;
    mask >>= 1u;
    if (!present) continue;
    vec4 numbers = stateNumbers[bit];
    uvec4 paint = statePaint[bit];
    if (!opacity && numbers.x >= 0.0) { look.opacity = base * numbers.x; opacity = true; }
    if (!strokeWidth && numbers.y >= 0.0) { look.strokeWidth = numbers.y; strokeWidth = true; }
    if (!halo && numbers.z >= 0.0) { look.halo = numbers.z; halo = true; }
    if (!label && numbers.w >= 0.0) { look.label = numbers.w; label = true; }
    if (!fill && paint.x != none) { look.fill = paint.x; fill = true; }
    if (!stroke && paint.y != none) { look.stroke = paint.y; stroke = true; }
  }
  return look;
}
`

const nodeData = `
uniform sampler2D nodePosition;
uniform sampler2D nodeStyle;
uniform usampler2D nodePaint;
uniform usampler2D nodeState;
float nodeDiameter(vec4 style) {
  uint flags = uint(style.w + 0.5);
  return (flags & 4u) != 0u ? style.x : style.x * zoom;
}
float nodeRadius(vec4 style) { return max(nodeDiameter(style) * 0.5, 1.25); }
`

const edgeData = `
uniform usampler2D edgeTopology;
uniform sampler2D edgeStyle;
uniform usampler2D edgeState;
`

export const nodeVertex: string = `${header}${nodeData}
in vec2 corner;
in uint instance;
out vec2 vLocal;
out float vRadius;
out float vStrokeWidth;
out float vHaloWidth;
flat out uint vShape;
flat out vec4 vFill;
flat out vec4 vStroke;
flat out float vOpacity;
void main() {
  ivec2 t = texel(instance);
  vec4 style = texelFetch(nodeStyle, t, 0);
  uvec4 paint = texelFetch(nodePaint, t, 0);
  uint flags = uint(style.w + 0.5);
  uint mask = texelFetch(nodeState, t, 0).r;
  bool highlighted = (mask & highlightMask) != 0u;
  if ((flags & 8u) == 0u || (overlay == 0 && (int(paint.z) != layerSlot || highlighted))) {
    gl_Position = hidden;
    return;
  }
  Look look = resolve(mask, Look(style.z, style.y, 0.0, 1.0, paint.x, paint.y));
  vec2 xy = texelFetch(nodePosition, t, 0).xy;
  float radius = nodeRadius(style);
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  vLocal = corner * (radius + halo + 1.5);
  vRadius = radius;
  vStrokeWidth = min(look.strokeWidth, radius * 0.5);
  vHaloWidth = halo;
  vShape = flags & 3u;
  vFill = paletteColor(look.fill);
  vStroke = paletteColor(look.stroke);
  vOpacity = look.opacity;
  gl_Position = toClip(toScreen(xy) + vLocal);
}
`

export const nodeFragment: string = `${header}
in vec2 vLocal;
in float vRadius;
in float vStrokeWidth;
in float vHaloWidth;
flat in uint vShape;
flat in vec4 vFill;
flat in vec4 vStroke;
flat in float vOpacity;
out vec4 fragColor;
float shapeDistance(vec2 p, float r) {
  if (vShape == 0u) return length(p) - r;
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
  vec4 color = mix(vFill, vStroke, ring);
  float alpha = color.a * inside * vOpacity;
  vec4 result = vec4(color.rgb * alpha, alpha);
  if (vHaloWidth > 0.0) {
    float h = haloColor.a * (1.0 - smoothstep(0.0, vHaloWidth, d)) * vOpacity;
    result += vec4(haloColor.rgb * h, h) * (1.0 - result.a);
  }
  if (result.a < 0.002) discard;
  fragColor = result;
}
`

export const edgeVertex: string = `${header}${nodeData}${edgeData}
in vec2 corner;
in uint instance;
out vec2 vPos;
out float vStart;
out float vEnd;
out float vHalfWidth;
out float vArrowLength;
out float vArrowHalf;
out float vHaloWidth;
flat out uint vDash;
flat out uint vArrow;
flat out vec4 vColor;
flat out float vOpacity;
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
  Look look = resolve(mask, Look(style.y, style.x, 0.0, 1.0, none, topology.z));
  ivec2 s = texel(topology.x);
  ivec2 e = texel(topology.y);
  vec2 ps = toScreen(texelFetch(nodePosition, s, 0).xy);
  vec2 pt = toScreen(texelFetch(nodePosition, e, 0).xy);
  vec2 delta = pt - ps;
  float len = length(delta);
  vec2 dir = len > 0.0 ? delta / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float width = max(look.strokeWidth, 0.5);
  float start = nodeRadius(texelFetch(nodeStyle, s, 0));
  float end = len - nodeRadius(texelFetch(nodeStyle, e, 0));
  float visible = end - start;
  uint arrow = (packed >> 2u) & 3u;
  float arrowLength = arrow != 0u && visible > width * 8.0 ? max(width * 4.0, 6.0) : 0.0;
  float arrowHalf = max(width * 1.6, 3.0);
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  float halfExtent = max(width * 0.5, arrowLength > 0.0 ? arrowHalf : 0.0) + halo + 1.0;
  float along = mix(start - 1.0, end + 1.0, corner.x);
  float across = corner.y * halfExtent;
  vPos = vec2(along, across);
  vStart = start;
  vEnd = end;
  vHalfWidth = width * 0.5;
  vArrowLength = arrowLength;
  vArrowHalf = arrowHalf;
  vHaloWidth = halo;
  vDash = packed & 3u;
  vArrow = arrow;
  vColor = paletteColor(look.stroke);
  vOpacity = look.opacity;
  gl_Position = visible > 0.5 ? toClip(ps + dir * along + normal * across) : hidden;
}
`

export const edgeFragment: string = `${header}
in vec2 vPos;
in float vStart;
in float vEnd;
in float vHalfWidth;
in float vArrowLength;
in float vArrowHalf;
in float vHaloWidth;
flat in uint vDash;
flat in uint vArrow;
flat in vec4 vColor;
flat in float vOpacity;
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
    float offset = along - vStart;
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
  if (result.a < 0.002) discard;
  fragColor = result;
}
`

export const labelVertex: string = `${header}${nodeData}
uniform float atlasFontSize;
in vec2 corner;
in uint glyphNode;
in uint glyphKind;
in vec4 glyphRect;
in vec4 glyphUv;
out vec2 vUv;
out float vScale;
flat out uint vKind;
flat out float vOpacity;
void main() {
  ivec2 t = texel(glyphNode);
  vec4 style = texelFetch(nodeStyle, t, 0);
  uvec4 paint = texelFetch(nodePaint, t, 0);
  uint flags = uint(style.w + 0.5);
  uint mask = texelFetch(nodeState, t, 0).r;
  Look look = resolve(mask, Look(style.z, style.y, 0.0, 1.0, paint.x, paint.y));
  float primary = (flags & 4u) != 0u ? 12.0 : 12.0 * min(1.0, zoom);
  if ((flags & 8u) == 0u || look.label < 0.5 || primary < labelMin) {
    gl_Position = hidden;
    return;
  }
  float size = glyphKind == 0u ? primary : primary * 11.0 / 12.0;
  float scale = size / atlasFontSize;
  float below = nodeRadius(style) + 3.0 + (glyphKind == 1u ? primary * 1.25 : 0.0);
  vec2 anchor = toScreen(texelFetch(nodePosition, t, 0).xy) + vec2(0.0, below);
  vUv = mix(glyphUv.xy, glyphUv.zw, corner);
  vScale = scale;
  vKind = glyphKind;
  vOpacity = look.opacity;
  gl_Position = toClip(anchor + (glyphRect.xy + corner * glyphRect.zw) * scale);
}
`

export const labelFragment: string = `${header}
uniform sampler2D atlas;
in vec2 vUv;
in float vScale;
flat in uint vKind;
flat in float vOpacity;
out vec4 fragColor;
void main() {
  float d = texture(atlas, vUv).r;
  float gamma = 0.08 / max(vScale * pixelRatio, 0.05);
  float ink = smoothstep(0.75 - gamma, 0.75 + gamma, d);
  float halo = smoothstep(0.55 - gamma, 0.55 + gamma, d);
  vec4 inkColor = vKind == 0u ? labelInk : labelMuted;
  vec3 rgb = mix(labelHalo.rgb, inkColor.rgb, ink);
  float alpha = max(halo * labelHalo.a, ink * inkColor.a) * vOpacity;
  if (alpha < 0.002) discard;
  fragColor = vec4(rgb * alpha, alpha);
}
`

export const cornerNode: Float32Array = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
export const cornerEdge: Float32Array = new Float32Array([0, -1, 1, -1, 0, 1, 1, 1])
export const cornerLabel: Float32Array = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1])
