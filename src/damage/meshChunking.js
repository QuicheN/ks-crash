// damage/meshChunking.js
// Rebuilds a loaded model into spatially-coherent destructible chunks.
//
// Some exported models organise their meshes by MATERIAL rather than by part —
// low_poly_wagon.glb is one: a single "mesh" there holds triangles from the front bumper and
// the tailgate, 16m apart. Detaching such a node would rip scattered triangles off the whole
// car at once. This module recovers the real pieces:
//
//   1. split every mesh into connected islands (weld by position, union-find over edges)
//   2. cluster islands whose centres nearly coincide — those are the material layers of one
//      visual piece (each wagon wheel is 5 islands from 5 different material groups)
//   3. emit one Group per cluster, holding one Mesh per island
//
// A chunk being a plain Group of Meshes is deliberate: partDetachment.js already traverses
// child meshes for its convex hull, so detachment, debris sync and interpolation all work on
// chunks with no changes.
import * as THREE from 'three';

const TRIANGLES = 4; // glTF primitive mode; anything else (LINES, POINTS) must be skipped

/** Copy a subset of triangles into a standalone non-indexed geometry, keeping every attribute. */
function extractTriangles(geometry, triIndices) {
  const index = geometry.index;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geometry.attributes)) {
    const src = geometry.attributes[name];
    const { itemSize } = src;
    const arr = new Float32Array(triIndices.length * 3 * itemSize);
    let w = 0;
    for (const t of triIndices) {
      for (let corner = 0; corner < 3; corner++) {
        const vi = index ? index.getX(t * 3 + corner) : t * 3 + corner;
        for (let k = 0; k < itemSize; k++) arr[w++] = src.getComponent(vi, k);
      }
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  return out;
}

/** Connected components of a geometry's triangles, welded by quantised position. */
function findIslands(geometry, weldEpsilon) {
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const triCount = index ? Math.floor(index.count / 3) : Math.floor(pos.count / 3);
  const q = 1 / weldEpsilon;

  const weld = new Map();
  const rep = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * q)},${Math.round(pos.getY(i) * q)},${Math.round(pos.getZ(i) * q)}`;
    if (!weld.has(key)) weld.set(key, i);
    rep[i] = weld.get(key);
  }

  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent.set(a, b);
  };
  for (const v of weld.values()) parent.set(v, v);

  const corner = (t, c) => rep[index ? index.getX(t * 3 + c) : t * 3 + c];
  for (let t = 0; t < triCount; t++) {
    union(corner(t, 0), corner(t, 1));
    union(corner(t, 1), corner(t, 2));
  }

  const islands = new Map();
  for (let t = 0; t < triCount; t++) {
    const root = find(corner(t, 0));
    if (!islands.has(root)) islands.set(root, []);
    islands.get(root).push(t);
  }
  return [...islands.values()];
}

/**
 * Split `root`'s meshes into chunk Groups, replacing the original meshes in the hierarchy.
 * Returns [{ node, localPos, radius, size, triangles }] with positions in `root`'s frame.
 */
export function splitIntoChunks(root, { weldEpsilon = 1e-4, clusterFactor = 0.3 } = {}) {
  root.updateWorldMatrix(false, true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

  // --- 1. every island, baked into root-local space -------------------------
  const sourceMeshes = [];
  root.traverse((o) => {
    if (o.isMesh && o.geometry?.attributes?.position) sourceMeshes.push(o);
  });

  const islands = [];
  for (const mesh of sourceMeshes) {
    // Skip anything that isn't triangles. GLTFLoader turns a LINES primitive into
    // THREE.LineSegments (not isMesh) but an explicit guard keeps this safe either way.
    if (mesh.geometry.drawRange?.count === 0) continue;
    if (mesh.isLineSegments || mesh.isPoints) continue;
    if (mesh.geometry.userData?.mode !== undefined && mesh.geometry.userData.mode !== TRIANGLES) continue;

    const toRootLocal = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
    for (const tris of findIslands(mesh.geometry, weldEpsilon)) {
      const geometry = extractTriangles(mesh.geometry, tris);
      geometry.applyMatrix4(toRootLocal);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      islands.push({
        geometry,
        material: mesh.material,
        triangles: tris.length,
        center: box.getCenter(new THREE.Vector3()),
        diagonal: box.getSize(new THREE.Vector3()).length(),
        box,
      });
    }
  }

  // --- 2. cluster co-located islands ---------------------------------------
  // Centre proximity, scaled by the SMALLER island's size. Bounding-box overlap was tried
  // first and is useless here: a long floor rail's box overlaps most of the car, which
  // collapses everything into one chunk.
  const parent = islands.map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let i = 0; i < islands.length; i++) {
    for (let j = i + 1; j < islands.length; j++) {
      const limit = clusterFactor * Math.min(islands[i].diagonal, islands[j].diagonal);
      if (islands[i].center.distanceTo(islands[j].center) < limit) {
        const a = find(i);
        const b = find(j);
        if (a !== b) parent[a] = b;
      }
    }
  }
  const clusters = new Map();
  islands.forEach((island, i) => {
    const key = find(i);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(island);
  });

  // --- 3. rebuild the hierarchy --------------------------------------------
  for (const mesh of sourceMeshes) mesh.removeFromParent();

  const chunks = [];
  for (const group of clusters.values()) {
    const box = new THREE.Box3();
    group.forEach((i) => box.union(i.box));
    const center = box.getCenter(new THREE.Vector3());

    // Pivot each chunk at its own centroid, matching how well-authored models (the sedan)
    // already pivot their parts — detachment spawns a body at the node transform and needs
    // no recentering.
    const node = new THREE.Group();
    node.position.copy(center);
    let triangles = 0;
    for (const island of group) {
      island.geometry.translate(-center.x, -center.y, -center.z);
      node.add(new THREE.Mesh(island.geometry, island.material));
      triangles += island.triangles;
    }
    root.add(node);

    chunks.push({ node, triangles });
  }

  // Metrics MUST be measured after the hierarchy exists, in the root's own world frame —
  // `center` above is in root-LOCAL units, which for a scaled model is not metres. Callers
  // compare these against chassis-local contact points and against world-space bounds, so
  // mixing the two frames silently corrupts every classification and proximity test.
  measureChunks(root, chunks);
  return chunks;
}

/** Fill in localPos / size / radius from world matrices, one consistent frame for all callers. */
function measureChunks(root, chunks) {
  root.updateWorldMatrix(false, true);
  const box = new THREE.Box3();
  for (const chunk of chunks) {
    box.setFromObject(chunk.node);
    chunk.localPos = box.getCenter(new THREE.Vector3());
    chunk.size = box.getSize(new THREE.Vector3());
    chunk.radius = chunk.size.length() * 0.5;
  }
}

/**
 * For models whose nodes ARE already parts (the sedan), adapt them to the same chunk shape
 * so both kinds of model feed one code path downstream. (Not a React hook — the name
 * deliberately avoids a "use" prefix.)
 */
export function partsFromNodes(root, isPart) {
  root.updateWorldMatrix(false, true);
  const chunks = [];
  root.traverse((o) => {
    if (!o.name || !isPart(o.name)) return;
    // Skip descendants of an already-registered part (the mesh-bearing children).
    for (const c of chunks) {
      let a = o.parent;
      while (a) {
        if (a === c.node) return;
        a = a.parent;
      }
    }
    const box = new THREE.Box3().setFromObject(o);
    const size = box.getSize(new THREE.Vector3());
    chunks.push({
      node: o,
      localPos: o.getWorldPosition(new THREE.Vector3()),
      radius: size.length() * 0.5,
      size,
      triangles: 0,
    });
  });
  return chunks;
}
