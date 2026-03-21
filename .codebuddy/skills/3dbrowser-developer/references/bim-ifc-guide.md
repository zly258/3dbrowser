# BIM/IFC Handling Guide for 3DBrowser

This document provides comprehensive guidance for handling Building Information Modeling (BIM) and IFC (Industry Foundation Classes) files in the 3DBrowser project.

## Overview

IFC is the standard open data model for BIM, used for sharing data between different BIM software applications. 3DBrowser uses the `web-ifc` library to parse and render IFC files.

## IFC Fundamentals

### IFC File Structure

IFC files contain:
- **Entities**: Building elements (walls, doors, windows, etc.)
- **Properties**: Metadata (dimensions, materials, classifications)
- **Geometry**: 3D representation
- **Relationships**: How elements relate to each other

### Common IFC Entities

```typescript
// Common IFC entity types
interface IFCEntityTypes {
  IFCPROJECT: string;
  IFCBUILDING: string;
  IFCFLOOR: string;
  IFCWALL: string;
  IFCDOOR: string;
  IFCWINDOW: string;
  IFCBEAM: string;
  IFCCOLUMN: string;
  IFCSTAIR: string;
  IFCSLAB: string;
}
```

## Loading IFC Files

### Basic IFC Loading

```typescript
import { IfcAPI } from 'web-ifc/web-ifc-api';

async function loadIFC(file: File): Promise<string> {
  const ifcApi = new IfcAPI();
  await ifcApi.Init();
  
  // Load file
  const modelID = await ifcApi.OpenModel(
    await file.arrayBuffer(),
    { COORDINATE_TO_ORIGIN: true }
  );
  
  // Create Three.js objects
  const meshes = await extractMeshes(ifcApi, modelID);
  
  // Add to scene
  meshes.forEach(mesh => scene.add(mesh));
  
  // Close model
  ifcApi.CloseModel(modelID);
  
  return modelID.toString();
}
```

### Extracting Geometries

```typescript
async function extractMeshes(ifcApi: IfcAPI, modelID: number) {
  const meshes: THREE.Mesh[] = [];
  const geometryData = ifcApi.GetLine(0, IfcGeometryType.IFCGEOMETRY);
  
  // Process geometries
  for (const geom of geometryData) {
    const mesh = createMeshFromGeometry(geom);
    meshes.push(mesh);
  }
  
  return meshes;
}
```

### Extracting Properties

```typescript
interface IFCPropertySet {
  name: string;
  properties: IFCProperty[];
}

interface IFCProperty {
  name: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'enum';
}

async function extractProperties(
  ifcApi: IfcAPI,
  modelID: number,
  expressID: number
): Promise<IFCPropertySet[]> {
  const propertySets = await ifcApi.GetPropertySets(
    modelID,
    expressID
  );
  
  return propertySets.map(pSet => ({
    name: pSet.Name.value,
    properties: pSet.HasProperties.map(prop => ({
      name: prop.Name.value,
      value: prop.NominalValue?.value,
      type: getPropType(prop.NominalValue?.type)
    }))
  }));
}
```

## Working with Web-IFC

### WASM Initialization

```typescript
import { IfcAPI } from 'web-ifc';

// Initialize WASM
const ifcApi = new IfcAPI();
await ifcApi.Init();

// Set WASM path
await ifcApi.SetWasmPath('/libs/');
```

### Loading Options

```typescript
interface IFCLoadOptions {
  COORDINATE_TO_ORIGIN: boolean;
  OPTIMIZE_PROFILES: boolean;
  WEBGL2: boolean;
}

const options: IFCLoadOptions = {
  COORDINATE_TO_ORIGIN: true,  // Move model to origin
  OPTIMIZE_PROFILES: true,      // Optimize geometry profiles
  WEBGL2: true                  // Use WebGL2 features
};

const modelID = await ifcApi.OpenModel(arrayBuffer, options);
```

### Querying IFC Data

```typescript
// Get all walls
async function getAllWalls(ifcApi: IfcAPI, modelID: number) {
  const wallIDs = await ifcApi.GetAllElementsOfType(
    modelID,
    IFCWALL,
    false
  );
  
  const walls = [];
  for (const id of wallIDs) {
    const wall = await ifcApi.GetLine(modelID, id);
    walls.push(wall);
  }
  
  return walls;
}

// Get element by ID
async function getElementByID(
  ifcApi: IfcAPI,
  modelID: number,
  expressID: number
) {
  return await ifcApi.GetLine(modelID, expressID);
}
```

## Geometry Processing

### Batching Geometry

For large IFC models, batch similar elements:

```typescript
interface GeometryBatch {
  type: string;
  geometries: THREE.BufferGeometry[];
  materials: THREE.Material[];
}

function batchGeometry(elements: IFCElement[]): GeometryBatch[] {
  const batches = new Map<string, GeometryBatch>();
  
  elements.forEach(element => {
    const batchKey = `${element.type}_${element.material}`;
    
    if (!batches.has(batchKey)) {
      batches.set(batchKey, {
        type: element.type,
        geometries: [],
        materials: []
      });
    }
    
    const batch = batches.get(batchKey)!;
    batch.geometries.push(element.geometry);
    batch.materials.push(element.material);
  });
  
  return Array.from(batches.values());
}
```

### Using InstancedMesh

```typescript
function createInstancedMeshForIFC(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  instances: InstanceData[]
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    geometry,
    material,
    instances.length
  );
  
  const matrix = new THREE.Matrix4();
  instances.forEach((inst, i) => {
    matrix.setPosition(inst.position);
    matrix.setRotationFromQuaternion(inst.rotation);
    matrix.scale(inst.scale, inst.scale, inst.scale);
    mesh.setMatrixAt(i, matrix);
    
    // Store IFC data in instance
    mesh.userData.instanceData = mesh.userData.instanceData || [];
    mesh.userData.instanceData[i] = inst.ifcData;
  });
  
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
```

## IFC Metadata

### Building Structure

```typescript
interface IFCBuildingStructure {
  project: IFCProject;
  sites: IFCSite[];
  buildings: IFCBuilding[];
  floors: IFCFloor[];
  rooms: IFCRoom[];
}

async function getBuildingStructure(
  ifcApi: IfcAPI,
  modelID: number
): Promise<IFCBuildingStructure> {
  const structure: IFCBuildingStructure = {
    project: null as any,
    sites: [],
    buildings: [],
    floors: [],
    rooms: []
  };
  
  // Get project
  const projects = await ifcApi.GetAllElementsOfType(
    modelID,
    IFCPROJECT,
    false
  );
  if (projects.length > 0) {
    structure.project = await ifcApi.GetLine(modelID, projects[0]);
  }
  
  // Get hierarchy
  // ... implementation
  
  return structure;
}
```

### Element Classification

```typescript
function classifyIFCElement(entity: any): IFCElementType {
  const type = entity.type;
  
  if (type === 'IFCWALL') return 'wall';
  if (type === 'IFCDOOR') return 'door';
  if (type === 'IFCWINDOW') return 'window';
  if (type === 'IFCSLAB') return 'slab';
  if (type === 'IFCBEAM') return 'beam';
  if (type === 'IFCCOLUMN') return 'column';
  if (type === 'IFCSTAIR') return 'stair';
  if (type === 'IFCRAILING') return 'railing';
  
  return 'other';
}
```

## Visualizing IFC

### Color Coding by Type

```typescript
const typeColors: Record<string, number> = {
  wall: 0x888888,
  door: 0x8B4513,
  window: 0x87CEEB,
  slab: 0x444444,
  beam: 0x6B8E23,
  column: 0x2F4F4F,
  stair: 0x556B2F
};

function applyTypeColor(mesh: THREE.Mesh, type: string) {
  const color = typeColors[type] || 0x888888;
  if (mesh.material instanceof THREE.MeshStandardMaterial) {
    mesh.material.color.setHex(color);
  }
}
```

### Transparency Control

```typescript
function setTransparency(mesh: THREE.Mesh, opacity: number) {
  if (mesh.material instanceof THREE.MeshStandardMaterial) {
    mesh.material.transparent = opacity < 1;
    mesh.material.opacity = opacity;
  }
}

function setElementVisibility(mesh: THREE.Mesh, visible: boolean) {
  mesh.visible = visible;
}
```

## Performance Optimization

### Progressive Loading

```typescript
async function loadIFCProgressively(
  ifcApi: IfcAPI,
  modelID: number,
  onProgress: (percent: number) => void
) {
  const totalElements = await getTotalElementCount(ifcApi, modelID);
  let loadedCount = 0;
  
  const chunkSize = 100;
  const elementIDs = await getAllElementIDs(ifcApi, modelID);
  
  for (let i = 0; i < elementIDs.length; i += chunkSize) {
    const chunk = elementIDs.slice(i, i + chunkSize);
    
    for (const id of chunk) {
      const element = await ifcApi.GetLine(modelID, id);
      const mesh = createMeshFromElement(element);
      scene.add(mesh);
      loadedCount++;
    }
    
    const progress = (loadedCount / totalElements) * 100;
    onProgress(progress);
    
    // Yield to UI thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}
```

### LOD for IFC

```typescript
function createLODForIFC(
  highDetail: THREE.Mesh,
  mediumDetail: THREE.Mesh,
  lowDetail: THREE.Mesh
): THREE.LOD {
  const lod = new THREE.LOD();
  lod.addLevel(highDetail, 0);
  lod.addLevel(mediumDetail, 50);
  lod.addLevel(lowDetail, 100);
  return lod;
}
```

## IFC Selection

### Selecting Elements

```typescript
interface IFCSelection {
  expressID: number;
  type: string;
  name: string;
  properties: IFCPropertySet[];
}

async function selectIFCElement(
  ifcApi: IfcAPI,
  modelID: number,
  mesh: THREE.Mesh
): Promise<IFCSelection> {
  const expressID = mesh.userData.expressID;
  
  const element = await ifcApi.GetLine(modelID, expressID);
  const properties = await extractProperties(ifcApi, modelID, expressID);
  
  return {
    expressID,
    type: element.type,
    name: element.Name?.value || 'Unnamed',
    properties
  };
}
```

### Highlighting Selection

```typescript
function highlightIFCElement(
  mesh: THREE.Mesh,
  highlight: boolean
) {
  if (highlight) {
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.userData.originalColor = mesh.material.color.getHex();
      mesh.material.color.setHex(0x3B82F6); // Accent color
    }
  } else {
    if (mesh.material instanceof THREE.MeshStandardMaterial) {
      mesh.material.color.setHex(mesh.userData.originalColor || 0x888888);
    }
  }
}
```

## IFC Export

### Exporting Modified IFC

```typescript
async function exportIFC(
  ifcApi: IfcAPI,
  modelID: number,
  filename: string
) {
  const data = await ifcApi.ExportModelAsIFC(modelID);
  
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  
  URL.revokeObjectURL(url);
}
```

## Common Issues and Solutions

### Issue: Large File Size

**Solution**: Use streaming and progressive loading

```typescript
async function loadLargeIFC(file: File) {
  const stream = file.stream();
  const reader = stream.getReader();
  
  // Process in chunks
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    // Process chunk
    await processChunk(value);
  }
}
```

### Issue: Slow Rendering

**Solution**: Use instancing and batching

```typescript
// Batch by type and material
const batches = batchGeometry(elements);

// Create instanced meshes
batches.forEach(batch => {
  const instancedMesh = createInstancedMeshForIFC(
    mergeGeometries(batch.geometries),
    batch.materials[0],
    getInstances(batch.geometries)
  );
  scene.add(instancedMesh);
});
```

### Issue: Missing Geometries

**Solution**: Check for representation items

```typescript
async function getElementGeometry(
  ifcApi: IfcAPI,
  modelID: number,
  expressID: number
) {
  const element = await ifcApi.GetLine(modelID, expressID);
  const representation = await ifcApi.GetLine(
    modelID,
    element.Representation?.Representations[0]
  );
  
  if (!representation) return null;
  
  const items = representation.Items;
  const geometries = [];
  
  for (const itemID of items) {
    const item = await ifcApi.GetLine(modelID, itemID);
    const geometry = await extractGeometryFromItem(item);
    geometries.push(geometry);
  }
  
  return geometries;
}
```

## Best Practices

1. **Use Web Workers** for IFC parsing to avoid blocking UI
2. **Implement progressive loading** for large files
3. **Cache parsed data** to avoid re-parsing
4. **Use instanced rendering** for repeated elements
5. **Implement LOD** for complex models
6. **Provide loading feedback** to users
7. **Handle errors gracefully** with meaningful messages
8. **Dispose resources** properly when unloading
9. **Extract and display properties** for user context
10. **Maintain IFC metadata** in userData for reference

## Testing IFC Files

### Test Checklist

- [ ] File loads successfully
- [ ] Geometry displays correctly
- [ ] Properties are extracted
- [ ] Selection works
- [ ] Measurements are accurate
- [ ] Performance is acceptable
- [ ] Memory usage is reasonable
- [ ] Export works (if applicable)

### Test IFC Files

Download sample IFC files from:
- https://ifcopenshell.org/ifc-files/
- https://www.buildingsmart.org/resources/
- https://github.com/IFCjs/web-ifc/tree/main/wasm/test/files

## Integration with ThreeViewer

```typescript
// In SceneManager
class SceneManager {
  private ifcLoader: IFCLoader;
  
  async loadIFC(file: File): Promise<string> {
    const uuid = THREE.MathUtils.generateUUID();
    
    try {
      const meshes = await this.ifcLoader.load(file);
      
      meshes.forEach(mesh => {
        mesh.userData.uuid = uuid;
        mesh.userData.format = 'ifc';
        this.contentGroup.add(mesh);
      });
      
      this.models.set(uuid, { type: 'ifc', meshes });
      
      return uuid;
    } catch (error) {
      console.error('IFC load failed:', error);
      throw error;
    }
  }
}
```

## Resources

- [web-ifc Documentation](https://ifcjs.github.io/web-ifc/)
- [IFC Specification](https://technical.buildingsmart.org/standards/ifc/)
- [IFC Open Shell](https://ifcopenshell.org/)
- [BuildingSMART](https://www.buildingsmart.org/)
