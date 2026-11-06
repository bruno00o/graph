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

const frame = `
uniform sampler2D bounds;

vec3 frameOf() {
  vec4 b = texelFetch(bounds, ivec2(0), 0);
  vec2 low = -b.zw;
  float size = max(max(b.x - low.x, b.y - low.y), 1.0) * 1.0001;
  return vec3(low, size);
}
`

export const fullVertex: string = `${header}
void main() {
  vec2 corner = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
  gl_Position = vec4(corner, 0.0, 1.0);
}
`

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
flat out vec4 value;

void main() {
  ivec2 t = texel(gl_VertexID);
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

export const springVertex: string = `${header}${nodes}
layout(location = 0) in vec4 edge;
layout(location = 1) in float rest;
uniform float alpha;
flat out vec4 value;

void main() {
  int own = int(edge.x);
  int peer = int(edge.y);
  ivec2 t = texel(own);
  gl_PointSize = 1.0;
  value = vec4(0.0);
  if (texelFetch(props, t, 0).z < 0.5) {
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
  gl_Position = clipOf(vec2(t), vec2(width, height));
}
`

export const integrateFragment: string = `${header}${nodes}${frame}
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
  vec2 v = s.zw + texelFetch(springs, t, 0).xy + force * strength + (center - position) * pull;
  v *= retention;
  color = vec4(position + v, v);
}
`
