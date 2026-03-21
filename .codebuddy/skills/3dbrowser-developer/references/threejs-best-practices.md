# Three.js Best Practices for 3DBrowser

This document outlines Three.js best practices specific to the 3DBrowser project.

## Core Principles

### 1. Resource Management

**Always dispose resources when done**

```typescript
// Good - proper cleanup
function createMesh() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const mesh = new THREE.Mesh(geometry, material);
  
  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    }
  };
}

// Cleanup in useEffect
useEffect(() => {
  const { mesh, dispose } = createMesh();
  scene.add(mesh);
  
  return () => {
    scene.remove(mesh);
    dispose();
  };
}, []);
```

**Dispose in correct order**: geometry → material → texture

```typescript
// Correct disposal order
texture.dispose();
material.dispose();
geometry.dispose();
```

### 2. Memory Optimization

**Use object pooling for temporary objects**

```typescript
// Pool for temporary vectors
const _vectorPool = new THREE.Vector3();

function calculateDistance(p1: THREE.Vector3, p2: THREE.Vector3): number {
  _vectorPool.copy(p1).sub(p2);
  const distance = _vectorPool.length();
  _vectorPool.set(0, 0, 0); // Reset for reuse
  return distance;
}
```

**Reuse geometries and materials**

```typescript
// Bad - creating new geometry for each mesh
for (let i = 0; i < 100; i++) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
}

// Good - reuse geometry
const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
for (let i = 0; i < 100; i++) {
  const mesh = new THREE.Mesh(sharedGeometry, material);
  mesh.position.set(i, 0, 0);
  scene.add(mesh);
}
```

### 3. Performance Optimization

**Use InstancedMesh for repeated objects**

```typescript
// For thousands of identical objects
const count = 10000;
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial();
const mesh = new THREE.InstancedMesh(geometry, material, count);

const matrix = new THREE.Matrix4();
for (let i = 0; i < count; i++) {
  matrix.setPosition(
    (i % 100) * 1.1,
    Math.floor(i / 100) * 1.1,
    0
  );
  mesh.setMatrixAt(i, matrix);
}

mesh.instanceMatrix.needsUpdate = true;
scene.add(mesh);
```

**Implement frustum culling**

```typescript
// Three.js automatically culls, but verify objects have correct bounding boxes
mesh.geometry.computeBoundingBox();
mesh.geometry.computeBoundingSphere();

// For custom frustum culling
const frustum = new THREE.Frustum();
const cameraViewProjectionMatrix = new THREE.Matrix4();
cameraViewProjectionMatrix.multiplyMatrices(
  camera.projectionMatrix,
  camera.matrixWorldInverse
);
frustum.setFromProjectionMatrix(cameraViewProjectionMatrix);

const intersects = frustum.intersectsBox(mesh.geometry.boundingBox);
```

**Use LOD (Level of Detail)**

```typescript
const lod = new THREE.LOD();

// High detail for close range
const highDetail = new THREE.Mesh(detailedGeometry, material);
lod.addLevel(highDetail, 0);

// Medium detail for medium range
const mediumDetail = new THREE.Mesh(mediumGeometry, material);
lod.addLevel(mediumDetail, 50);

// Low detail for far range
const lowDetail = new THREE.Mesh(lowDetailGeometry, material);
lod.addLevel(lowDetail, 100);

scene.add(lod);
```

## Scene Organization

### Grouping Strategy

```typescript
// Organize scene by function
const sceneGroup = new THREE.Group();
sceneGroup.name = 'mainScene';

const modelsGroup = new THREE.Group();
modelsGroup.name = 'models';
sceneGroup.add(modelsGroup);

const helpersGroup = new THREE.Group();
helpersGroup.name = 'helpers';
sceneGroup.add(helpersGroup);

const uiGroup = new THREE.Group();
uiGroup.name = 'ui';
sceneGroup.add(uiGroup);

scene.add(sceneGroup);
```

### Naming Conventions

```typescript
// Use descriptive names
mesh.name = 'building_floor_1';
group.name = 'furniture_chairs';
material.name = 'concrete_material';

// Use UUID for tracking
const uuid = THREE.MathUtils.generateUUID();
mesh.userData.uuid = uuid;
mesh.userData.originalName = originalName;
```

## Lighting Best Practices

### Efficient Lighting Setup

```typescript
// Use minimal lights for performance
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 20, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// For shadows, optimize shadow map
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 100;
```

### Baking Lighting (Optional)

For static scenes, bake lighting into textures to reduce runtime calculations.

## Camera and Controls

### Camera Setup

```typescript
// Use OrthographicCamera for CAD-like views
const aspect = width / height;
const frustumSize = 100;
const camera = new THREE.OrthographicCamera(
  frustumSize * aspect / -2,
  frustumSize * aspect / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  10000
);
camera.position.set(100, 100, 100);
camera.lookAt(0, 0, 0);
```

### OrbitControls Configuration

```typescript
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; // Smooth motion
controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.5;
controls.panSpeed = 1.0;
controls.zoomSpeed = 1.0;

// For orthographic camera
controls.enableZoom = true;
controls.enableRotate = true;
controls.enablePan = true;

// Limit controls if needed
controls.minDistance = 10;
controls.maxDistance = 5000;
controls.maxPolarAngle = Math.PI; // Allow full rotation
```

## Geometry Best Practices

### Building Efficient Geometries

```typescript
// Merge geometries when possible
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const geometries = [];
for (let i = 0; i < 10; i++) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.translate(i * 1.1, 0, 0);
  geometries.push(geometry);
}

const mergedGeometry = mergeGeometries(geometries);
const mesh = new THREE.Mesh(mergedGeometry, material);
```

### Optimize Vertex Count

```typescript
// Simplify geometry for distant objects
import { simplifyGeometry } from 'three/examples/jsm/utils/SimplifyModifier.js';

const simplifiedGeometry = simplifyGeometry(originalGeometry, 0.5); // 50% reduction
```

## Material Best Practices

### Material Sharing

```typescript
// Share materials for same type objects
const concreteMaterial = new THREE.MeshStandardMaterial({
  color: 0x888888,
  roughness: 0.9,
  metalness: 0.1
});

// Apply to multiple meshes
mesh1.material = concreteMaterial;
mesh2.material = concreteMaterial;
```

### Material Updates

```typescript
// Batch material updates
material.needsUpdate = true;

// For texture updates
texture.needsUpdate = true;

// Update all materials at once
function updateAllMaterials(scene: THREE.Scene) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.material.needsUpdate = true;
    }
  });
}
```

## Texture Best Practices

### Efficient Texture Loading

```typescript
import { TextureLoader } from 'three';

const loader = new TextureLoader();
loader.load(
  'path/to/texture.png',
  (texture) => {
    texture.encoding = THREE.sRGBEncoding;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
  },
  (progress) => {
    const percent = (progress.loaded / progress.total) * 100;
    console.log(`Loading: ${percent}%`);
  },
  (error) => {
    console.error('Texture load error:', error);
  }
);
```

### Texture Compression

Use compressed texture formats (KTX, DDS, WEBP) for web deployment.

## Raycasting

### Efficient Raycasting

```typescript
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Update raycaster
raycaster.setFromCamera(mouse, camera);

// Raycast only against relevant objects
const objects = [];
scene.traverse((object) => {
  if (object instanceof THREE.Mesh && object.visible) {
    objects.push(object);
  }
});

const intersects = raycaster.intersectObjects(objects);

if (intersects.length > 0) {
  const hit = intersects[0];
  console.log('Hit object:', hit.object);
  console.log('Hit point:', hit.point);
  console.log('Distance:', hit.distance);
}
```

### Raycasting Optimization

```typescript
// Use spatial indexing for large scenes
import { Octree } from 'three/examples/jsm/math/Octree.js';

const octree = new Octree();
octree.fromGraphNode(scene);

// Raycast against octree
const result = new THREE.Raycaster();
const intersect = octree.raycast(result.ray);
```

## Animation Best Practices

### Smooth Animations

```typescript
// Use requestAnimationFrame
let animationId: number;

function animate() {
  animationId = requestAnimationFrame(animate);
  
  // Update controls
  controls.update();
  
  // Render
  renderer.render(scene, camera);
}

// Start animation
animate();

// Stop animation when done
function stopAnimation() {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
}
```

### Use TWEEN for Complex Animations

```typescript
import * as TWEEN from '@tweenjs/tween.js';

function animateCameraTo(position: THREE.Vector3) {
  new TWEEN.Tween(camera.position)
    .to({ x: position.x, y: position.y, z: position.z }, 1000)
    .easing(TWEEN.Easing.Quadratic.Out)
    .onUpdate(() => {
      camera.lookAt(0, 0, 0);
    })
    .start();
}

// Update tween in animation loop
function animate() {
  requestAnimationFrame(animate);
  TWEEN.update();
  renderer.render(scene, camera);
}
```

## Error Handling

### WebGL Context Loss

```typescript
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  console.warn('WebGL context lost');
  
  // Attempt to restore
  setTimeout(() => {
    renderer.forceContextRestore();
  }, 1000);
}, false);

renderer.domElement.addEventListener('webglcontextrestored', (event) => {
  console.log('WebGL context restored');
  // Reinitialize scene if needed
}, false);
```

### Graceful Degradation

```typescript
function checkWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    return !!context;
  } catch (e) {
    return false;
  }
}

if (!checkWebGL()) {
  showErrorMessage('WebGL 2.0 is required');
}
```

## Debugging

### Debug Helpers

```typescript
import { AxesHelper, GridHelper, BoxHelper } from 'three';

// Axes helper
const axesHelper = new AxesHelper(10);
scene.add(axesHelper);

// Grid helper
const gridHelper = new GridHelper(100, 100);
scene.add(gridHelper);

// Bounding box helper
const boxHelper = new BoxHelper(mesh, 0xff0000);
scene.add(boxHelper);

// Update box helper when mesh changes
mesh.geometry.computeBoundingBox();
boxHelper.update();
```

### Statistics Monitoring

```typescript
import Stats from 'three/examples/jsm/libs/stats.module.js';

const stats = new Stats();
stats.showPanel(0); // FPS
document.body.appendChild(stats.dom);

function animate() {
  requestAnimationFrame(animate);
  stats.begin();
  
  // Render scene
  renderer.render(scene, camera);
  
  stats.end();
}
```

### Performance Profiling

```typescript
// Log render info
console.log('Render info:', renderer.info);

// Log scene stats
function logSceneStats() {
  let triangleCount = 0;
  let vertexCount = 0;
  
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry;
      triangleCount += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
      vertexCount += geometry.attributes.position.count;
    }
  });
  
  console.log(`Triangles: ${triangleCount}, Vertices: ${vertexCount}`);
}
```

## Export and Import

### GLTF Export

```typescript
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

function exportSceneToGLTF() {
  const exporter = new GLTFExporter();
  
  exporter.parse(
    scene,
    (gltf) => {
      const output = JSON.stringify(gltf, null, 2);
      const blob = new Blob([output], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'scene.gltf';
      link.click();
    },
    (error) => {
      console.error('Export error:', error);
    },
    { binary: false }
  );
}
```

### GLTF Import

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

function loadGLTF(url: string) {
  const loader = new GLTFLoader();
  
  loader.load(
    url,
    (gltf) => {
      scene.add(gltf.scene);
      
      // Optimize
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    },
    (progress) => {
      const percent = (progress.loaded / progress.total) * 100;
      console.log(`Loading: ${percent}%`);
    },
    (error) => {
      console.error('Load error:', error);
    }
  );
}
```

## Best Practices Checklist

- [ ] Always dispose geometries, materials, and textures
- [ ] Reuse geometries and materials when possible
- [ ] Use InstancedMesh for repeated objects
- [ ] Implement frustum culling
- [ ] Use LOD for complex scenes
- [ ] Minimize the number of lights
- [ ] Optimize shadow map resolution
- [ ] Use spatial indexing for large scenes
- [ ] Batch material updates
- [ ] Use efficient raycasting
- [ ] Handle WebGL context loss
- [ ] Implement error boundaries
- [ ] Profile performance regularly
- [ ] Use requestAnimationFrame for animations
- [ ] Clean up in useEffect cleanup functions

## Common Pitfalls to Avoid

1. **Not disposing resources** - Causes memory leaks
2. **Creating too many geometries** - Causes performance issues
3. **Using too many lights** - Slows down rendering
4. **Not using frustum culling** - Wastes render time
5. **Inefficient raycasting** - Slows down interactions
6. **Not handling context loss** - Causes app crashes
7. **Using very high resolution textures** - Slows loading and rendering
8. **Not using instanced rendering** - Wastes draw calls
9. **Updating materials unnecessarily** - Wastes GPU time
10. **Not optimizing geometry vertex count** - Reduces performance
