export const bundlePath = `
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
`
