export const bridgeUnit = 20
export const bridgeSpots = 8

export const bridgeData: string = `
uniform usampler2D bridgeData;
uniform vec2 bridgeLook;
flat out vec4 vBridgeA;
flat out vec4 vBridgeB;
flat out uint vBridges;
const vec2 bridgeUp = vec2(-0.4472136, -0.8944272);
bool bridgeCrossed(uint edge, uint j, out vec2 c, out vec2 e) {
  ivec2 t = texel(edge);
  uvec4 topology = texelFetch(edgeTopology, t, 0);
  if ((topology.w & 16u) == 0u || edgeShown(t, topology) <= 0.0) return false;
  vec2 a = texelFetch(nodePosition, texel(topology.x), 0).xy;
  vec2 d = texelFetch(nodePosition, texel(topology.y), 0).xy;
  uvec4 path = pathOf(edge);
  float bend = texelFetch(edgeStyle, t, 0).z;
  if (path.y > 1u) {
    int k = min(int(j), int(path.y) - 2);
    c = toScreen(pathPoint(path, k, a, d, bend));
    e = toScreen(pathPoint(path, k + 1, a, d, bend));
    return true;
  }
  if (bend != 0.0) return false;
  c = toScreen(a);
  e = toScreen(d);
  return true;
}
float bridgeAt(vec2 p, vec2 q, vec2 c, vec2 e) {
  vec2 r = q - p;
  vec2 s = e - c;
  float den = r.x * s.y - r.y * s.x;
  if (abs(den) <= 1e-6 * length(r) * length(s)) return -1.0;
  vec2 w = c - p;
  float t = (w.x * s.y - w.y * s.x) / den;
  float u = (w.x * r.y - w.y * r.x) / den;
  return t > 0.0 && t < 1.0 && u > 0.0 && u < 1.0 ? t : -1.0;
}
void bridgeOut(float spots[${bridgeSpots}], uint found, uint sides) {
  vBridgeA = vec4(spots[0], spots[1], spots[2], spots[3]);
  vBridgeB = vec4(spots[4], spots[5], spots[6], spots[7]);
  vBridges = found | (sides << 4u);
}
`

export const straightBridges: string = `
  float spots[${bridgeSpots}] = float[${bridgeSpots}](0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  uint found = 0u;
  uint sides = 0u;
  float bridgeRadius = bridgeLook.x;
  if (bridgeRadius > 0.0) {
    uvec4 range = texelFetch(bridgeData, texel(instance), 0);
    bool up = dot(normal, bridgeUp) >= 0.0;
    for (uint i = 0u; i < range.y && found < ${bridgeSpots}u; i++) {
      uvec4 entry = texelFetch(bridgeData, texel(range.x + i), 0);
      vec2 c;
      vec2 e;
      if (!bridgeCrossed(entry.x, entry.z, c, e)) continue;
      float u = bridgeAt(ps, pt, c, e);
      float spot = u * len;
      if (u < 0.0 || spot < start + startHead + bridgeRadius || spot > end - endHead - bridgeRadius) continue;
      spots[found] = spot;
      if (!up) sides |= 1u << found;
      found++;
    }
    if (found > 0u && bridgeLook.y < 0.5) {
      float lift = bridgeRadius + width * 0.5 + halo + margin;
      body = max(body, lift);
      head = max(head, lift);
    }
  }
  bridgeOut(spots, found, sides);
`

export const pathBridges: string = `
  float spots[${bridgeSpots}] = float[${bridgeSpots}](0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  uint found = 0u;
  uint sides = 0u;
  float bridgeRadius = bridgeLook.x;
  if (bridgeRadius > 0.0) {
    uvec4 range = texelFetch(bridgeData, texel(instance), 0);
    for (uint i = 0u; i < range.y && found < ${bridgeSpots}u; i++) {
      uvec4 entry = texelFetch(bridgeData, texel(range.x + i), 0);
      int own = int(entry.y);
      if (own < k - 2 || own > k || own > count - 2) continue;
      vec2 c;
      vec2 e;
      if (!bridgeCrossed(entry.x, entry.z, c, e)) continue;
      vec2 p = toScreen(pathPoint(path, own, a, d, style.z));
      vec2 q = toScreen(pathPoint(path, own + 1, a, d, style.z));
      float u = bridgeAt(p, q, c, e);
      if (u < 0.0) continue;
      float spot = mix(stationOf(path, own, total, spacing), stationOf(path, own + 1, total, spacing), u);
      if (spot < start + startHead + bridgeRadius || spot > end - endHead - bridgeRadius) continue;
      vec2 segment = q - p;
      spots[found] = spot;
      if (dot(vec2(-segment.y, segment.x), bridgeUp) < 0.0) sides |= 1u << found;
      found++;
    }
    if (found > 0u && bridgeLook.y < 0.5) {
      float lift = bridgeRadius + width * 0.5 + halo + margin;
      body = max(body, lift);
      head = max(head, lift);
    }
  }
  bridgeOut(spots, found, sides);
`

export const bridgeFragment: string = `
flat in vec4 vBridgeA;
flat in vec4 vBridgeB;
flat in uint vBridges;
uniform vec2 bridgeLook;
float bridgeAcross(float along, float y, float aa, inout float keep) {
  uint count = vBridges & 15u;
  float radius = bridgeLook.x;
  bool gone = false;
  float arcs = 1e9;
  for (uint i = 0u; i < count; i++) {
    float spot = i < 4u ? vBridgeA[i] : vBridgeB[i - 4u];
    float dx = along - spot;
    if (bridgeLook.y > 0.5) {
      keep = min(keep, smoothstep(radius - aa, radius + aa, abs(dx)));
      continue;
    }
    float side = ((vBridges >> (4u + i)) & 1u) != 0u ? -1.0 : 1.0;
    vec2 p = vec2(dx, y * side);
    if (abs(dx) < radius) gone = true;
    float arc = p.y >= 0.0 ? abs(length(p) - radius)
      : min(length(p - vec2(radius, 0.0)), length(p + vec2(radius, 0.0)));
    arcs = min(arcs, arc);
  }
  return min(gone ? 1e9 : abs(y), arcs);
}
`
