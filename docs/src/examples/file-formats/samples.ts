const trees = [
  ['alder', 'Alder', 'broadleaf', 0, -150, 34],
  ['birch', 'Birch', 'broadleaf', 140, -60, 26],
  ['cedar', 'Cedar', 'conifer', 100, 110, 30],
  ['dogwood', 'Dogwood', 'broadleaf', -90, 130, 20],
  ['elm', 'Elm', 'broadleaf', -160, -20, 28],
  ['fir', 'Fir', 'conifer', 30, -10, 38],
  ['ginkgo', 'Ginkgo', 'relict', 250, 40, 22],
  ['hazel', 'Hazel', 'broadleaf', -250, 90, 18],
  ['juniper', 'Juniper', 'conifer', 210, 200, 20],
  ['larch', 'Larch', 'conifer', -40, 240, 24],
] as const

const colors = { broadleaf: '#5b8c3a', conifer: '#2f6b6b', relict: '#c08a2e' } as const

const links = [
  ['alder', 'birch', 3],
  ['alder', 'elm', 2],
  ['alder', 'fir', 4],
  ['birch', 'fir', 2],
  ['birch', 'ginkgo', 1],
  ['cedar', 'fir', 3],
  ['cedar', 'juniper', 2],
  ['cedar', 'larch', 2],
  ['dogwood', 'larch', 1],
  ['dogwood', 'elm', 2],
  ['elm', 'hazel', 1],
  ['fir', 'larch', 3],
  ['ginkgo', 'juniper', 1],
  ['hazel', 'dogwood', 1],
] as const

const hex = (color: string) => [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16))

const gexfNodes = trees
  .map(([id, label, kind, x, y, size]) => {
    const [r, g, b] = hex(colors[kind])
    return `      <node id="${id}" label="${label}">
        <attvalues><attvalue for="0" value="${kind}"/></attvalues>
        <viz:color r="${r}" g="${g}" b="${b}"/>
        <viz:position x="${x}" y="${y}"/>
        <viz:size value="${size}"/>
      </node>`
  })
  .join('\n')

const gexfEdges = links
  .map(
    ([source, target, weight], index) =>
      `      <edge id="${index}" source="${source}" target="${target}" weight="${weight}"/>`,
  )
  .join('\n')

export const gexf = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://gexf.net/1.3" xmlns:viz="http://gexf.net/1.3/viz" version="1.3">
  <meta><description>Ten trees and the paths between them</description></meta>
  <graph defaultedgetype="undirected">
    <attributes class="node">
      <attribute id="0" title="kind" type="string"/>
    </attributes>
    <nodes>
${gexfNodes}
    </nodes>
    <edges>
${gexfEdges}
    </edges>
  </graph>
</gexf>
`

export const graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="d0" for="node" attr.name="label" attr.type="string"/>
  <key id="d1" for="node" attr.name="floor" attr.type="int"><default>1</default></key>
  <key id="d2" for="edge" attr.name="weight" attr.type="double"/>
  <graph id="building" edgedefault="undirected">
    <node id="east">
      <data key="d0">East wing</data>
      <graph id="east:" edgedefault="undirected">
        <node id="e1"><data key="d0">Hall</data></node>
        <node id="e2"><data key="d0">Library</data><data key="d1">2</data></node>
        <node id="e3"><data key="d0">Studio</data><data key="d1">2</data></node>
        <node id="e4"><data key="d0">Garden</data><data key="d1">0</data></node>
      </graph>
    </node>
    <node id="west">
      <data key="d0">West wing</data>
      <graph id="west:" edgedefault="undirected">
        <node id="w1"><data key="d0">Lobby</data></node>
        <node id="w2"><data key="d0">Kitchen</data></node>
        <node id="w3"><data key="d0">Workshop</data><data key="d1">0</data></node>
        <node id="w4"><data key="d0">Archive</data><data key="d1">3</data></node>
        <node id="w5"><data key="d0">Terrace</data><data key="d1">3</data></node>
      </graph>
    </node>
    <edge source="e1" target="e2"><data key="d2">2</data></edge>
    <edge source="e1" target="e3"/>
    <edge source="e2" target="e3"/>
    <edge source="e1" target="e4" directed="true"/>
    <edge source="w1" target="w2"><data key="d2">2</data></edge>
    <edge source="w1" target="w3"/>
    <edge source="w3" target="w4" directed="true"/>
    <edge source="w4" target="w5"/>
    <edge source="w2" target="w5"/>
    <edge source="e1" target="w1"><data key="d2">3</data></edge>
    <edge source="e4" target="w3"/>
  </graph>
</graphml>
`

export const jsonGraph = `{
  "graph": {
    "id": "rivers",
    "label": "Rivers and the lakes they join",
    "directed": true,
    "nodes": {
      "spring-a": { "label": "North spring", "metadata": { "group": "spring" } },
      "spring-b": { "label": "East spring", "metadata": { "group": "spring" } },
      "spring-c": { "label": "West spring", "metadata": { "group": "spring" } },
      "brook": { "label": "Brook", "metadata": { "group": "stream" } },
      "creek": { "label": "Creek", "metadata": { "group": "stream" } },
      "upper-lake": { "label": "Upper lake", "metadata": { "group": "lake" } },
      "river": { "label": "River", "metadata": { "group": "stream" } },
      "lower-lake": { "label": "Lower lake", "metadata": { "group": "lake" } },
      "delta": { "label": "Delta", "metadata": { "group": "sea" } }
    },
    "edges": [
      { "source": "spring-a", "target": "brook", "relation": "flows into" },
      { "source": "spring-b", "target": "brook", "relation": "flows into" },
      { "source": "spring-c", "target": "creek", "relation": "flows into" },
      { "source": "brook", "target": "upper-lake", "relation": "flows into" },
      { "source": "creek", "target": "upper-lake", "relation": "flows into" },
      { "source": "upper-lake", "target": "river", "relation": "feeds" },
      { "source": "river", "target": "lower-lake", "relation": "flows into" },
      { "source": "creek", "target": "lower-lake", "relation": "flows into" },
      { "source": "lower-lake", "target": "delta", "relation": "feeds" }
    ]
  }
}
`

export const csv = {
  nodes: `id,label,group,size
1,Anvil,tools,24
2,Bellows,tools,18
3,Chisel,tools,16
4,"Drill, small",tools,14
5,Easel,studio,22
6,Frame,studio,16
7,Glaze,studio,12
8,Hinge,parts,12
9,Iron rod,parts,14
10,Jig,parts,16
`,
  edges: `source,target,weight
1,2,3
1,3,2
1,9,4
2,9,1
3,4,2
3,10,1
5,6,3
5,7,2
6,8,2
8,9,1
9,10,2
4,10,1
6,3,1
`,
}
