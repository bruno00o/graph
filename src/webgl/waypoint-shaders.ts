import { bundlePath } from './bundle-glsl'
import { edgeData, endData, header, nodeData } from './shaders'

export const waypointWindow = 32
export const waypointWindowShift = 24
const waypointEdgeMask = 0xffffff
const miterLimit = 2

export const waypointVertex: string = `${header}${nodeData}${edgeData}${endData}${bundlePath}
uniform float arcPiece;
layout(location = 0) in vec2 corner;
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
  uint edge = instance & ${waypointEdgeMask}u;
  int window = int(instance >> ${waypointWindowShift}u);
  ivec2 t = texel(edge);
  uvec4 topology = texelFetch(edgeTopology, t, 0);
  vec4 style = texelFetch(edgeStyle, t, 0);
  uint packed = topology.w;
  uint mask = edgeMask(t);
  uint part = edgePart(t, packed, mask);
  uvec4 path = pathOf(edge);
  int count = int(path.y);
  if (!fixedPath(path) || part == skipEdge || count < 3) {
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
  vec2 a = texelFetch(nodePosition, s, 0).xy;
  vec2 d = texelFetch(nodePosition, e, 0).xy;
  vec2 wraps = fixedWraps(path, a, d);
  bool globe = globeInfo.z > 0.0;
  if (arcPiece > 0.5 && (globe || wraps.x == wraps.y)) {
    gl_Position = hidden;
    return;
  }
  vec2 copy = arcPiece > 0.5 ? vec2(wraps.x - wraps.y, 0.0) : vec2(0.0);
  int k = min(window * ${waypointWindow} + int(corner.x + 0.5), count - 1);
  vec2 world = fixedPoint(path, k, a, d, wraps) + copy;
  vec2 here = toScreen(world);
  vec2 back = k > 0 ? toScreen(fixedPoint(path, k - 1, a, d, wraps) + copy) : here;
  vec2 ahead = k < count - 1 ? toScreen(fixedPoint(path, k + 1, a, d, wraps) + copy) : here;
  vec2 incoming = here - back;
  vec2 outgoing = ahead - here;
  float inLength = length(incoming);
  float outLength = length(outgoing);
  vec2 inDir = inLength > 1e-6 ? incoming / inLength : vec2(0.0);
  vec2 outDir = outLength > 1e-6 ? outgoing / outLength : vec2(0.0);
  vec2 joined = inDir + outDir;
  float joinedLength = length(joined);
  vec2 dir = joinedLength > 1e-6 ? joined / joinedLength : (outLength > 1e-6 ? outDir : (inLength > 1e-6 ? inDir : vec2(1.0, 0.0)));
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 side = inLength > 1e-6 ? vec2(-inDir.y, inDir.x) : vec2(-outDir.y, outDir.x);
  float miter = 1.0 / max(abs(dot(normal, side)), ${(1 / miterLimit).toFixed(2)});
  vec2 first = fixedPoint(path, 1, a, d, wraps) + copy;
  vec2 last = fixedPoint(path, count - 2, a, d, wraps) + copy;
  vec2 tip = fixedPoint(path, count - 1, a, d, wraps) + copy;
  vec2 start0 = toScreen(a + copy);
  vec2 firstScreen = toScreen(first);
  vec2 lastScreen = toScreen(last);
  vec2 tipScreen = toScreen(tip);
  float head = distance(start0, firstScreen);
  float tail = distance(lastScreen, tipScreen);
  float scale = globe ? scaleAt(first) : zoom;
  float body = uintBitsToFloat(path.z) * scale;
  float total = head + body + tail;
  float along = k == 0 ? 0.0 : k == count - 1 ? total : head + fixedTexel(path, k - 1).z * scale;
  float before = k <= 1 ? 0.0 : k == count - 1 ? head + body : head + fixedTexel(path, k - 2).z * scale;
  float after = k >= count - 2 ? total : head + fixedTexel(path, k).z * scale;
  vec4 sourceOutline = nodeOutline(s, texelFetch(nodeStyle, s, 0), scaleAt(a));
  vec4 targetOutline = nodeOutline(e, texelFetch(nodeStyle, e, 0), scaleAt(d));
  float start = towardReach(sourceOutline, firstScreen - start0);
  float end = total - towardReach(targetOutline, lastScreen - tipScreen);
  float visible = end - start;
  float flow = edgeFlow(mask, style.w);
  Line line = edgeLine(t, topology, style, look, flow);
  float width = max(line.width, line.farWidth);
  uint arrow = (packed >> 2u) & 3u;
  float arrowHalf = max(width * 1.6, 3.0);
  float halo = look.halo > 0.5 ? haloWidth : 0.0;
  float margin = 0.5 / pixelRatio + 0.25;
  float startHead = (arrow & 1u) != 0u && visible > line.width * 8.0 ? max(line.width * 4.0, 6.0) : 0.0;
  float endHead = (arrow & 2u) != 0u && visible > line.farWidth * 8.0 ? max(line.farWidth * 4.0, 6.0) : 0.0;
  bool dotted = line.dash == 2u || line.farDash == 2u;
  float bodyWidth = (dotted ? max(width * 0.6, 1.0) : width * 0.5) + halo + margin;
  float headWidth = max(bodyWidth, arrowHalf + halo + margin);
  bool wide = (startHead > 0.0 && before <= start + startHead)
    || (endHead > 0.0 && after >= end - endHead);
  float across = corner.y * (wide ? headWidth : bodyWidth);
  vPos = vec2(along, across);
  vClip = globe ? worldSide(world) : 1.0;
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
  gl_Position = visible > 0.5 ? toClip(here + normal * (across * miter)) : hidden;
}
`
