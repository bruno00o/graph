import { coverVertex } from '../../webgl/gl'
import { softening } from './barnes-hut'

const header = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
`

const nodes = `
uniform sampler2D state;
uniform sampler2D props;
uniform int width;
uniform int height;

ivec2 texel(int index) {
  return ivec2(index % width, index / width);
}

vec4 clipOf(vec2 cell, vec2 size) {
  return vec4((cell + 0.5) / size * 2.0 - 1.0, 0.0, 1.0);
}

const vec4 outside = vec4(2.0, 2.0, 0.0, 1.0);
`

const groups = `
uniform sampler2D groupInfo;
uniform sampler2D groupSums;
uniform sampler2D groupBoxes;
uniform int groupWidth;
uniform int groupHeight;
uniform int groups;
uniform int roots;
uniform float gap;
uniform float limit;
uniform float pushing;

ivec2 groupTexel(int slot) {
  return ivec2(slot % groupWidth, slot / groupWidth);
}

vec4 boxOf(int slot) {
  vec4 b = texelFetch(groupBoxes, groupTexel(slot), 0);
  return vec4(b.z - b.x, b.w - b.y, b.z + b.x, b.w + b.y) * 0.5;
}

bool filled(int slot) {
  return texelFetch(groupSums, groupTexel(slot), 0).z > 0.5;
}

ivec2 childrenOf(int slot) {
  if (slot < 0) return ivec2(0, roots);
  vec4 info = texelFetch(groupInfo, groupTexel(slot), 0);
  return ivec2(int(info.y), int(info.y) + int(info.z));
}
`

const lanes = `
uniform int lanes;
uniform int laneWidth;
uniform int laneHeight;

vec4 laneOf(int slot, int item) {
  int at = slot * lanes + item % lanes;
  return clipOf(vec2(at % laneWidth, at / laneWidth), vec2(laneWidth, laneHeight));
}
`

const frame = `
uniform sampler2D bounds;

vec3 frameOf() {
  vec4 b = texelFetch(bounds, ivec2(0), 0);
  vec2 low = -b.zw;
  float size = max(max(b.x - low.x, b.y - low.y), 1.0) * 1.0001;
  return vec3(low, size);
}
`

export const fullVertex: string = `${header}${coverVertex}`

export const valueFragment: string = `${header}
flat in vec4 value;
out vec4 color;

void main() {
  color = value;
}
`

export const boundsBlockFragment: string = `${header}${nodes}
out vec4 color;

void main() {
  ivec2 origin = ivec2(gl_FragCoord.xy) * 4;
  ivec2 end = min(origin + 4, ivec2(width, height));
  vec4 extent = vec4(-3.0e38);
  for (int y = origin.y; y < end.y; y++) {
    for (int x = origin.x; x < end.x; x++) {
      ivec2 t = ivec2(x, y);
      if (texelFetch(props, t, 0).y < 0.5) continue;
      vec2 p = texelFetch(state, t, 0).xy;
      extent = max(extent, vec4(p, -p));
    }
  }
  color = extent;
}
`

export const boundsFragment: string = `${header}
uniform sampler2D partial;
uniform ivec2 size;
out vec4 color;

void main() {
  ivec2 origin = ivec2(gl_FragCoord.xy) * 4;
  ivec2 end = min(origin + 4, size);
  vec4 extent = vec4(-3.0e38);
  for (int y = origin.y; y < end.y; y++) {
    for (int x = origin.x; x < end.x; x++) extent = max(extent, texelFetch(partial, ivec2(x, y), 0));
  }
  color = extent;
}
`

export const splatVertex: string = `${header}${nodes}${frame}
uniform int cells;
layout(location = 0) in uint node;
flat out vec4 value;

void main() {
  ivec2 t = texel(int(node));
  gl_PointSize = 1.0;
  value = vec4(0.0);
  if (texelFetch(props, t, 0).y < 0.5) {
    gl_Position = outside;
    return;
  }
  vec2 p = texelFetch(state, t, 0).xy;
  vec3 f = frameOf();
  vec2 cell = clamp(floor((p - f.xy) / f.z * float(cells)), 0.0, float(cells - 1));
  gl_Position = clipOf(cell, vec2(cells));
  value = vec4(p, 1.0, 0.0);
}
`

export const reduceFragment: string = `${header}
uniform sampler2D finer;
out vec4 color;

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy) * 2;
  color = texelFetch(finer, c, 0) + texelFetch(finer, c + ivec2(1, 0), 0)
    + texelFetch(finer, c + ivec2(0, 1), 0) + texelFetch(finer, c + ivec2(1, 1), 0);
}
`

export const springVertex: string = `${header}${nodes}${lanes}
layout(location = 0) in vec4 edge;
layout(location = 1) in float rest;
layout(location = 2) in float lift;
uniform float alpha;
uniform int lifted;
flat out vec4 value;

void main() {
  int own = int(edge.x);
  int peer = int(edge.y);
  ivec2 t = texel(own);
  gl_PointSize = 1.0;
  value = vec4(0.0);
  if (texelFetch(props, t, 0).z < 0.5 || (lift >= 0.0) != (lifted == 1)) {
    gl_Position = outside;
    return;
  }
  vec4 a = texelFetch(state, t, 0);
  vec4 b = texelFetch(state, texel(peer), 0);
  vec2 d = b.xy + b.zw - a.xy - a.zw;
  float span = length(d);
  if (span < 1.0e-6) {
    float turn = float(min(own, peer)) * 2.399963;
    d = vec2(cos(turn), sin(turn)) * (own < peer ? 1.0e-3 : -1.0e-3);
    span = 1.0e-3;
  }
  value = vec4(d * ((span - rest) / span * alpha * edge.z * edge.w), 0.0, 0.0);
  gl_Position = lifted == 1 ? laneOf(int(lift), own) : clipOf(vec2(t), vec2(width, height));
}
`

export const groupSplatVertex: string = `${header}${nodes}${lanes}
layout(location = 0) in vec4 pair;
uniform int mode;
uniform int groups;
flat out vec4 value;

void main() {
  gl_PointSize = 1.0;
  value = vec4(0.0);
  if (mode == 1 && pair.w < 0.5) {
    gl_Position = outside;
    return;
  }
  int slot = int(pair.y);
  vec2 p = texelFetch(state, texel(int(pair.x)), 0).xy;
  value = mode == 2 ? vec4(pair.z - p, p + pair.z) : vec4(p, 1.0, 0.0);
  gl_Position = laneOf(mode == 1 ? groups + slot : slot, int(pair.x));
}
`

export const groupReduceFragment: string = `${header}
uniform sampler2D partialLanes;
uniform int lanes;
uniform int laneWidth;
uniform int groupWidth;
uniform int entries;
uniform int mode;
out vec4 color;

void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  int slot = t.y * groupWidth + t.x;
  vec4 total = mode == 1 ? vec4(-3.0e38) : vec4(0.0);
  if (slot < entries) {
    for (int lane = 0; lane < lanes; lane++) {
      int at = slot * lanes + lane;
      vec4 value = texelFetch(partialLanes, ivec2(at % laneWidth, at / laneWidth), 0);
      total = mode == 1 ? max(total, value) : total + value;
    }
  }
  color = total;
}
`

export const groupSolveFragment: string = `${header}${groups}
uniform sampler2D groupSprings;
uniform float drift;
uniform float boxStiffness;
out vec4 color;

void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  int slot = t.y * groupWidth + t.x;
  color = vec4(0.0);
  if (slot >= groups) return;
  vec4 info = texelFetch(groupInfo, t, 0);
  vec4 sum = texelFetch(groupSums, t, 0);
  if (info.w <= 0.0 || sum.z < 0.5) return;
  float mass = info.w;
  vec2 move = texelFetch(groupSprings, t, 0).xy / mass;
  int parent = int(info.x);
  if (parent >= 0) {
    vec4 up = texelFetch(groupSums, groupTexel(parent), 0);
    move += (up.xy / up.z - sum.xy / sum.z) * drift;
  }
  if (pushing > 0.5) {
    vec4 a = boxOf(slot);
    ivec2 range = childrenOf(parent);
    for (int k = range.x; k < range.y; k++) {
      if (k == slot || !filled(k)) continue;
      vec4 b = boxOf(k);
      vec2 d = b.xy - a.xy;
      vec2 o = a.zw + b.zw + gap - abs(d);
      if (o.x <= 0.0 || o.y <= 0.0) continue;
      vec2 side = vec2(
        d.x < 0.0 || (d.x == 0.0 && k < slot) ? -1.0 : 1.0,
        d.y < 0.0 || (d.y == 0.0 && k < slot) ? -1.0 : 1.0
      );
      vec2 push = o.x <= o.y ? vec2(o.x * side.x, 0.0) : vec2(0.0, o.y * side.y);
      float size = o.x <= o.y ? o.x : o.y;
      float other = texelFetch(groupInfo, groupTexel(k), 0).w;
      float share = other <= 0.0 ? 1.0 : other / (mass + other);
      move -= push * (boxStiffness * min(size, limit) / size * share);
    }
  }
  color = vec4(move, 0.0, 0.0);
}
`

export const integrateFragment: string = `${header}${nodes}${frame}${groups}
uniform sampler2D groupMotion;
uniform float cohesion;
uniform float drift;
uniform float leafStiffness;
uniform sampler2D springs;
uniform sampler2D pyramid;
uniform int levels;
uniform int count;
uniform float strength;
uniform float pull;
uniform vec2 center;
uniform float retention;
out vec4 color;
const float softening = ${softening.toFixed(1)};

vec2 push(vec2 d, float mass) {
  return d * (mass / (dot(d, d) + softening));
}

vec2 grouped(int slot, vec2 position, float radius) {
  vec2 v = vec2(0.0);
  if (groups == 0) return v;
  if (slot >= 0) {
    vec4 sum = texelFetch(groupSums, groupTexel(slot), 0);
    vec4 direct = texelFetch(groupSums, groupTexel(groups + slot), 0);
    vec2 c = sum.xy / max(sum.z, 1.0);
    vec2 b = direct.xy / max(direct.z, 1.0);
    v += (b - position) * cohesion + (c - b) * drift;
    int at = slot;
    for (int depth = 0; depth < 64 && at >= 0; depth++) {
      ivec2 g = groupTexel(at);
      v += texelFetch(groupMotion, g, 0).xy;
      at = int(texelFetch(groupInfo, g, 0).x);
    }
  }
  if (pushing < 0.5) return v;
  ivec2 range = childrenOf(slot);
  float reach = radius + gap;
  vec2 away = vec2(0.0);
  for (int k = range.x; k < range.y; k++) {
    if (!filled(k)) continue;
    vec4 box = boxOf(k);
    vec2 e = position - box.xy;
    if (abs(e.x) <= box.z && abs(e.y) <= box.w) {
      vec2 o = box.zw - abs(e) + reach;
      away += o.x <= o.y
        ? vec2(e.x < 0.0 ? -o.x : o.x, 0.0)
        : vec2(0.0, e.y < 0.0 ? -o.y : o.y);
      continue;
    }
    vec2 q = e - clamp(e, -box.zw, box.zw);
    float d2 = dot(q, q);
    if (d2 >= reach * reach) continue;
    float d = sqrt(d2);
    away += q / d * (reach - d);
  }
  float size = length(away);
  if (size > 0.0) v += away * (leafStiffness * min(size, limit) / size);
  return v;
}

void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  int index = t.y * width + t.x;
  vec4 s = texelFetch(state, t, 0);
  vec4 p = texelFetch(props, t, 0);
  if (index >= count || p.y < 0.5 || p.z < 0.5) {
    color = vec4(s.xy, 0.0, 0.0);
    return;
  }
  vec2 position = s.xy;
  vec3 f = frameOf();
  vec2 u = (position - f.xy) / f.z;
  vec2 force = vec2(0.0);
  for (int level = 1; level <= levels; level++) {
    int g = 1 << level;
    ivec2 c = clamp(ivec2(floor(u * float(g))), ivec2(0), ivec2(g - 1));
    ivec2 low = max(((c >> 1) - 1) * 2, ivec2(0));
    ivec2 high = min(((c >> 1) + 1) * 2 + 1, ivec2(g - 1));
    int lod = levels - level;
    for (int y = low.y; y <= high.y; y++) {
      for (int x = low.x; x <= high.x; x++) {
        if (abs(x - c.x) <= 1 && abs(y - c.y) <= 1) continue;
        vec4 cell = texelFetch(pyramid, ivec2(x, y), lod);
        if (cell.z > 0.0) force += push(cell.xy / cell.z - position, cell.z);
      }
    }
  }
  int g = 1 << levels;
  ivec2 c = clamp(ivec2(floor(u * float(g))), ivec2(0), ivec2(g - 1));
  for (int y = max(c.y - 1, 0); y <= min(c.y + 1, g - 1); y++) {
    for (int x = max(c.x - 1, 0); x <= min(c.x + 1, g - 1); x++) {
      vec4 cell = texelFetch(pyramid, ivec2(x, y), 0);
      if (x == c.x && y == c.y) cell -= vec4(position, 1.0, 0.0);
      if (cell.z < 0.5) continue;
      vec2 d = cell.xy / cell.z - position;
      if (dot(d, d) < 1.0e-12) d = 1.0e-3 * vec2(cos(float(index)), sin(float(index)));
      force += push(d, cell.z);
    }
  }
  vec2 v = s.zw + texelFetch(springs, t, 0).xy + force * strength + (center - position) * pull
    + grouped(int(p.w), position, p.x);
  v *= retention;
  color = vec4(position + v, v);
}
`
