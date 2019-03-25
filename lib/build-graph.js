"use strict";

var _ = require("./lodash"),
    Graph = require("./graphlib").Graph;

module.exports = buildGraph;

function buildGraph(parseTree) {
  var isDirected = parseTree.type !== "graph",
      isMultigraph = !parseTree.strict,
      defaultStack = [{ node: {}, edge: {}, graph: {} }],
      id = parseTree.id,
      g = new Graph({ directed: isDirected, multigraph: isMultigraph, compound: true });
      g.setGraph(id === null ? {} : {id: id});
  _.each(parseTree.stmts, function(stmt) { handleStmt(g, stmt, defaultStack); });
  return g;
}

function handleStmt(g, stmt, defaultStack, sg) {
  switch(stmt.type) {
    case "node": handleNodeStmt(g, stmt, defaultStack, sg); break;
    case "edge": handleEdgeStmt(g, stmt, defaultStack, sg); break;
    case "subgraph": handleSubgraphStmt(g, stmt, defaultStack, sg); break;
    case "attr": handleAttrStmt(g, stmt, defaultStack, sg); break;
    case "inlineAttr": handleInlineAttrsStmt(g, stmt, defaultStack, sg); break;
  }
}

function handleNodeStmt(g, stmt, defaultStack, sg) {
  var v = stmt.id,
      attrs = stmt.attrs;
  maybeCreateNode(g, v, defaultStack, sg);

  const target = g.node(v);

  _.merge(target, attrs);
  if(attrs.pos) {
    const [x,y] = attrs.pos.split(',')
    target.x = parseFloat(x);
    target.y = -parseFloat(y);

    target.width = conv(attrs.width);
    target.height = conv(attrs.height, 48);
  }
}

function conv (gvCoord, mult=64) {
  return (parseFloat(gvCoord)*mult);
}

function handleEdgeStmt(g, stmt, defaultStack, sg) {
  var attrs = stmt.attrs,
      prev, curr;


  if(attrs.pos) {
    const points = attrs.pos
      .substr(2)
      .split(' ')
      .map(coords => {
        coords = coords.replace('\\\n', '').split(',')
        if(isNaN(coords[0])) {
          console.log('nan')
        }
        return ({ x: parseFloat(coords[0]), y: -parseFloat(coords[1])})
      })
    attrs.points = points;
  }

  _.each(stmt.elems, function(elem) {
    handleStmt(g, elem, defaultStack, sg);

    switch(elem.type) {
      case "node": curr = [elem.id]; break;
      case "subgraph": curr = collectNodeIds(elem); break;
    }

    _.each(prev, function(v) {
      _.each(curr, function(w) {
        var name;
        if (g.hasEdge(v, w) && g.isMultigraph()) {
          name = _.uniqueId("edge");
        }
        if (!g.hasEdge(v, w, name)) {
          g.setEdge(v, w, _.clone(_.last(defaultStack).edge), name);
        }
        _.merge(g.edge(v, w, name), attrs);
      });
    });

    prev = curr;
  });
}

function handleSubgraphStmt(g, stmt, defaultStack, sg) {
  var id = stmt.id;
  if (id === undefined) {
    id = generateSubgraphId(g);
  }

  defaultStack.push(_.clone(_.last(defaultStack)));

  maybeCreateNode(g, id, defaultStack, sg);

  _.each(stmt.stmts, function(s) {
    handleStmt(g, s, defaultStack, id);
  });

  // If there are no statements remove the subgraph
  if (!g.children(id).length) {
    g.removeNode(id);
  }

  defaultStack.pop();
}

function handleAttrStmt(g, stmt, defaultStack, sg) {
  if(stmt.attrType == 'graph') {
    const target = sg ? g.node(sg) : g.graph()
    _.merge(target, stmt.attrs);
    /*
    if(stmt.attrs.lwidth) {
      target.width = parseFloat(stmt.attrs.lwidth) * 64;
      target.height = parseFloat(stmt.attrs.lheight) * 64;
    } */
    if (stmt.attrs.bb) {
      const [x,y,width, height] = stmt.attrs.bb.split(',')
      target.x = parseFloat(x);
      target.y = -parseFloat(y);

      target.width = parseFloat(width);
      target.height = parseFloat(height) / 64;
    }
  } else {
    _.merge(_.last(defaultStack)[stmt.attrType], stmt.attrs);
  }
}

function handleInlineAttrsStmt(g, stmt, defaultStack, sg) {
  if(stmt.attrs.pos) {
    debugger;
  }
  _.merge(sg ? g.node(sg) : g.graph(), stmt.attrs);
}

function generateSubgraphId(g) {
  var id;
  do {
    id = _.uniqueId("sg");
  } while (g.hasNode(id));
  return id;
}

function maybeCreateNode(g, v, defaultStack, sg) {
  if (!g.hasNode(v)) {
    g.setNode(v, _.clone(_.last(defaultStack).node));
    g.setParent(v, sg);
  }
}

// Collect all nodes involved in a subgraph statement
function collectNodeIds(stmt) {
  var ids = {},
      stack = [],
      curr;

  var push = stack.push.bind(stack);

  push(stmt);
  while(stack.length) {
    curr = stack.pop();
    switch(curr.type) {
      case "node": ids[curr.id] = true; break;
      case "edge": _.each(curr.elems, push); break;
      case "subgraph": _.each(curr.stmts, push); break;
    }
  }

  return _.keys(ids);
}

