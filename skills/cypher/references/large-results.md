# Large results: send each node once

A query that returns paths sends every node again in every row: a node that sits in four paths arrives four times, with all its properties. For a large result, wrap the query so that the database sends each distinct node and relationship once, with only the properties the graph draws. The library runs no query: you write this in your backend. What it guarantees is the shape of the rows it reads, which are plain maps as well as driver objects.

The wrapper needs Neo4j 5.23 or later, for the `CALL () { … }` form, and the `IS ::` type predicates of 5.9 or later. It is Neo4j's form: other databases that speak Cypher (Memgraph, Neptune, Apache AGE, FalkorDB) may not accept it, and it was checked on Neo4j 5.26 only.

```cypher
CALL () {
  MATCH p = (a:Person)-[:KNOWS*1..2]->(b:Person)
  RETURN p AS path, [a, b] AS pair, {first: a} AS info
}
UNWIND [{v: path}, {v: pair}, {v: info}] AS box
WITH box.v AS element
WITH CASE
  WHEN element IS :: PATH THEN nodes(element) + relationships(element)
  WHEN element IS :: LIST<ANY> THEN element
  WHEN element IS :: MAP THEN [key IN keys(element) | element[key]]
  ELSE [element]
END AS items
UNWIND items AS element
WITH CASE
  WHEN element IS :: PATH THEN nodes(element) + relationships(element)
  WHEN element IS :: LIST<ANY> THEN element
  WHEN element IS :: MAP THEN [key IN keys(element) | element[key]]
  ELSE [element]
END AS items
UNWIND items AS element
WITH CASE
  WHEN element IS :: PATH THEN nodes(element) + relationships(element)
  WHEN element IS :: LIST<ANY> THEN element
  WHEN element IS :: MAP THEN [key IN keys(element) | element[key]]
  ELSE [element]
END AS items
UNWIND items AS element
WITH DISTINCT element
WHERE element IS :: NODE OR element IS :: RELATIONSHIP
RETURN CASE
  WHEN element IS :: NODE THEN {
    elementId: elementId(element),
    labels: labels(element),
    properties: element { .name, .born }
  }
  ELSE {
    elementId: elementId(element),
    type: type(element),
    startNodeElementId: elementId(startNode(element)),
    endNodeElementId: elementId(endNode(element)),
    properties: element { .since }
  }
END AS element
```

- **The query** goes inside `CALL () { … }`, unchanged except that every returned column needs an alias. Without one, Neo4j refuses it with `Expression in CALL { RETURN ... } must be aliased (use AS)`, for `n.name` and `count(*)` alike.
- **The boxes.** Read the column names from the query without running it, and write the `UNWIND [{v: …}]` line from them. Each value goes in a one-field map so that it reaches the next step with no static type. Without the box, a query whose columns are all paths fails at analysis (`Type mismatch: expected Map, Node or Relationship but was Path`), and so does one whose columns are all nodes (`expected Path but was Node`), because Neo4j checks every branch of the `CASE` against the type of the column, taken or not. A column name that is not a plain identifier needs backticks.
- **The steps.** Each step opens one level: a path becomes its nodes and relationships, a list is unwound, a map unfolds its values, anything else stays as it is. The template has three steps: a path, a list of paths, or a map that holds a list of paths. A deeper result needs one more block per level, and elements still wrapped after the last step are dropped without any error: test with the deepest query you expect.
- **The end.** `WITH DISTINCT` keeps one copy of each element, the filter drops numbers, text, dates, points and `null`, and the maps carry `elementId`, `labels` or `type`, the ends of a relationship and the properties you list. `element { .name, .born }` is a map projection: list the properties of nodes and of relationships separately, or write `element { .* }` to send them all.

Read the column names with `EXPLAIN`, which plans the query and returns `keys` without running it, then write the boxes and pass the result to `cypherGraph`. With `session.run`, call `keys()` on the result before awaiting it: the awaited result has no `keys`.

```ts
import { cypherGraph, type CypherInput } from '@bruno00o/graph/cypher'

declare const driver: {
  executeQuery(query: string): Promise<CypherInput & { readonly keys: readonly string[] }>
}
declare function lean(query: string, boxes: string): string
declare const query: string

const { keys } = await driver.executeQuery(`EXPLAIN ${query}`)
const boxes = keys.map((key) => `{v: \`${key}\`}`).join(', ')
const { nodes: items, edges: links } = cypherGraph(await driver.executeQuery(lean(query, boxes)))
console.log(items.length, links.length)
```

`lean` is a function of your own that returns the template above with `query` and `boxes` written in.

## What differs from the plain query

- **Order.** `WITH DISTINCT` does not keep the order of the rows. Categorical colors are given in the order of arrival, and the first placement of the nodes follows it, so the same result can come back with different colors. Give the color scale a `domain` to fix them (styling skill).
- **Missing properties.** A projection returns `name: null` for a property the element does not have. `cypherGraph` leaves null properties out, so `node.properties` has the same keys as with the plain query, restricted to the ones you listed.
- **Integers, dates and points** in the projected properties are converted as usual.
- **Rows.** The wrapped query returns more rows of one map each (60,000 against 40,000 rows of one path, in the measure below), and `cypherGraph` reads each map as a node or a relationship.

Measured on 20,000 nodes with 20 properties each and 40,000 relationships, returned as 40,000 paths (each node arrives four times): the plain query and `cypherGraph` took 600 ms and the wrapped query 185 ms, with three properties per node and one per relationship. Local Neo4j 5.26 in Docker, median of five runs: the transfer over a network is not in the figure.
