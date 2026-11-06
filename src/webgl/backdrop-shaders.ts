import { gridLevelCount } from '../core/background-grid'
import { header } from './shaders'

export const gridVertex: string = `${header}
void main() {
  vec2 corner = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(corner, 0.0, 1.0);
}
`

export const gridFragment: string = `${header}
uniform vec4 gridLevels[${gridLevelCount}];
uniform uvec2 gridColors;
uniform int gridDots;
out vec4 fragColor;
float lineDistance(float p, float offset, float pitch) {
  float m = mod(p - offset, pitch);
  return min(m, pitch - m);
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, viewport.y * pixelRatio - gl_FragCoord.y) / pixelRatio;
  vec4 minor = paletteColor(gridColors.x);
  vec4 major = paletteColor(gridColors.y);
  vec4 color = vec4(0.0);
  for (int i = 0; i < ${gridLevelCount}; i++) {
    vec4 level = gridLevels[i];
    float dx = lineDistance(p.x, level.y, level.x);
    float dy = lineDistance(p.y, level.z, level.x);
    float strength = clamp(level.w - 1.0, 0.0, 1.0);
    float cover;
    if (gridDots == 1) {
      float radius = mix(0.8, 1.3, strength);
      cover = clamp((radius - length(vec2(dx, dy))) * pixelRatio + 0.5, 0.0, 1.0);
    } else {
      cover = clamp((0.5 - min(dx, dy)) * pixelRatio + 0.5, 0.0, 1.0);
    }
    vec4 tone = level.w <= 1.0 ? vec4(minor.rgb, minor.a * level.w) : mix(minor, major, strength);
    float alpha = tone.a * cover;
    color = vec4(tone.rgb * alpha, alpha) + color * (1.0 - alpha);
  }
  fragColor = color;
}
`

export const hullVertex: string = `${header}
layout(location = 0) in vec4 hullA;
in float hullAOffset;
in vec4 hullB;
in float hullBOffset;
in vec2 hullCenter;
in uvec2 hullColors;
in vec2 hullSize;
out vec2 vScreen;
flat out vec2 vAnchor;
flat out vec2 vNormal;
flat out vec4 vFill;
flat out vec4 vStroke;
flat out float vStrokeWidth;
void main() {
  float reach = hullSize.y / zoom;
  float extra = (hullSize.x * 0.5 + 1.5) / zoom;
  vec2 a = hullA.xy + hullA.zw * (hullAOffset + reach);
  vec2 b = hullB.xy + hullB.zw * (hullBOffset + reach);
  vec2 world = gl_VertexID == 0 ? hullCenter : gl_VertexID == 1 ? a + hullA.zw * extra : b + hullB.zw * extra;
  vec2 normal = hullA.zw + hullB.zw;
  float size = length(normal);
  vNormal = size > 1e-6 ? normal / size : hullA.zw;
  vAnchor = toScreen(a);
  vFill = paletteColor(hullColors.x);
  vStroke = paletteColor(hullColors.y);
  vStrokeWidth = hullSize.x;
  vScreen = toScreen(world);
  gl_Position = toClip(vScreen);
}
`

export const hullFragment: string = `${header}
uniform int hullStroke;
in vec2 vScreen;
flat in vec2 vAnchor;
flat in vec2 vNormal;
flat in vec4 vFill;
flat in vec4 vStroke;
flat in float vStrokeWidth;
out vec4 fragColor;
void main() {
  float d = dot(vScreen - vAnchor, vNormal);
  if (hullStroke == 0) {
    float cover = clamp(0.5 - d * pixelRatio, 0.0, 1.0);
    fragColor = vec4(vFill.rgb * vFill.a, vFill.a) * cover;
    return;
  }
  if (vStrokeWidth <= 0.0) discard;
  float cover = clamp((vStrokeWidth * 0.5 - abs(d)) * pixelRatio + 0.5, 0.0, 1.0);
  fragColor = vec4(vStroke.rgb * vStroke.a, vStroke.a) * cover;
}
`
