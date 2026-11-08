export const fixedFlag = 0x80000000
export const fixedGeo = 0x40000000
export const fixedStartMask = 0xffffff

export const bundlePath: string = `
uniform usampler2D edgePath;
uniform sampler2D bundlePoints;
uniform float bundleMix;
uniform float pathLanes;
uvec4 pathOf(uint edge) {
  return bundleMix < 0.0 ? uvec4(0u) : texelFetch(edgePath, texel(edge), 0);
}
vec2 pathPoint(uvec4 path, int k, vec2 a, vec2 d, float bend) {
  float u = float(k) / float(max(int(path.y) - 1, 1));
  vec4 shift = texelFetch(bundlePoints, texel(path.x + uint(k)), 0);
  vec2 delta = d - a;
  return mix(a, d, u) + mix(shift.xy, shift.zw, bundleMix)
    + vec2(-delta.y, delta.x) * (bend * pathLanes * 4.0 * u * (1.0 - u));
}
float pathLength(uvec4 path) {
  return mix(uintBitsToFloat(path.z), uintBitsToFloat(path.w), bundleMix);
}
bool fixedPath(uvec4 path) { return (path.x & ${fixedFlag}u) != 0u; }
vec4 fixedTexel(uvec4 path, int at) {
  return texelFetch(bundlePoints, texel((path.x & ${fixedStartMask}u) + uint(at)), 0);
}
vec2 fixedWraps(uvec4 path, vec2 a, vec2 d) {
  if ((path.x & ${fixedGeo}u) == 0u) return vec2(0.0);
  float first = fixedTexel(path, 0).x;
  float last = fixedTexel(path, int(path.y) - 3).x;
  return vec2(512.0 * floor((first - a.x) / 512.0 + 0.5), 512.0 * floor((last - d.x) / 512.0 + 0.5));
}
vec2 fixedPoint(uvec4 path, int k, vec2 a, vec2 d, vec2 wraps) {
  if (k <= 0) return a;
  if (k >= int(path.y) - 1) return vec2(d.x + wraps.y - wraps.x, d.y);
  return fixedTexel(path, k - 1).xy - vec2(wraps.x, 0.0);
}
vec2 anyPathPoint(uvec4 path, int k, vec2 a, vec2 d, float bend, vec2 wraps) {
  return fixedPath(path) ? fixedPoint(path, k, a, d, wraps) : pathPoint(path, k, a, d, bend);
}
`
