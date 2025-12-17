

import * as THREE from "three";
import { LMBLoader } from "./lmbLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import * as WebIFC from "web-ifc";
import { TFunc } from "./Locales";
import { SceneSettings, AxisOption } from "./SceneManager";

export interface LoadedItem {
    name: string;
    uuid: string;
    type: "MODEL" | "TILES";
    object?: THREE.Object3D;
}

export type ProgressCallback = (percent: number, msg?: string) => void;

// Helper to correct Up-Axis to Y-Up
const applyUpAxisCorrection = (object: THREE.Object3D, sourceAxis: AxisOption) => {
    // We assume Target is +Y Up (Three.js standard)
    const q = new THREE.Quaternion();
    
    switch (sourceAxis) {
        case '+x':
            // +X is up. We want X -> Y. Rotate +90 around Z.
            q.setFromAxisAngle(new THREE.Vector3(0,0,1), Math.PI/2);
            break;
        case '-x':
            // -X is up. We want -X -> Y. Rotate -90 around Z.
            q.setFromAxisAngle(new THREE.Vector3(0,0,1), -Math.PI/2);
            break;
        case '+y':
            // Already Y up.
            return;
        case '-y':
            // -Y is up. Rotate 180 around X.
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI);
            break;
        case '+z':
            // +Z is up (Standard Engineering). Rotate -90 around X (Right Hand).
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
            break;
        case '-z':
            // -Z is up. Rotate +90 around X.
            q.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2);
            break;
    }

    object.applyQuaternion(q);
};

// --- Custom Raw Web-IFC Loading Logic ---

// Helper: Basic Colors for IFC Types (since we aren't using the heavy standard processor)
const getIfcColor = (typeName: string) => {
    switch (typeName) {
        case 'IFCWALL': return 0xEEEEEE;
        case 'IFCWALLSTANDARDCASE': return 0xEEEEEE;
        case 'IFCSLAB': return 0xAAAAAA;
        case 'IFCWINDOW': return 0x88CCFF;
        case 'IFCDOOR': return 0x8B4513;
        case 'IFCBEAM': return 0x666666;
        case 'IFCCOLUMN': return 0x666666;
        case 'IFCROOF': return 0x8B0000;
        default: return 0xCCCCCC;
    }
};

const IFCRELDEFINESBYPROPERTIES = 4061202542; // WEBIFC.IFCRELDEFINESBYPROPERTIES is usually constant, but safe to fetch by string name if possible or use numeric const if strict.
// Note: WebIFC exports enums, but here we assume direct access. Let's use string based GetLineIDsWithType which handles it.

const loadIFC = async (url: string, onProgress: ProgressCallback, t: TFunc): Promise<THREE.Group> => {
    const api = new WebIFC.IfcAPI();
    
    // Point to the CDN used in importmap
    api.SetWasmPath("https://unpkg.com/web-ifc@0.0.53/", true);
    
    await api.Init();

    // Fetch file data using FileLoader for progress events
    const loader = new THREE.FileLoader();
    loader.setResponseType('arraybuffer');
    
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        loader.load(
            url,
            (data) => resolve(data as ArrayBuffer),
            (event) => {
                if (event.total > 0) {
                    // Map 0-100% download progress to 0-30% of total load time estimate
                    const percent = (event.loaded / event.total) * 100 * 0.3;
                    onProgress(percent, `${t("reading")}... ${Math.round((event.loaded / event.total) * 100)}%`);
                }
            },
            reject
        );
    });

    const data = new Uint8Array(buffer);

    onProgress(30, t("analyzing"));
    
    // Open Model
    const modelID = api.OpenModel(data);
    
    const rootGroup = new THREE.Group();
    rootGroup.name = "IFC Model";
    
    // 1. Build Property Map (Object ID -> [PropertySet ID, ...])
    // This allows fast property lookup on click without iterating all relations every time
    const propertyMap = new Map<number, number[]>();
    
    try {
        // Get all lines of type IFCRELDEFINESBYPROPERTIES
        // We use the numeric ID for IFCRELDEFINESBYPROPERTIES if available in the enum, or just scan
        // Since we don't have the full enum imported, we trust GetLineIDsWithType
        const relID = WebIFC.IFCRELDEFINESBYPROPERTIES; 
        const lines = api.GetLineIDsWithType(modelID, relID);
        const size = lines.size();
        
        for (let i = 0; i < size; i++) {
            const id = lines.get(i);
            const rel = api.GetLine(modelID, id);
            
            // rel.RelatedObjects is an array of IDs (or single Ref depending on schema, usually Array)
            // rel.RelatingPropertyDefinition is the Pset ID
            
            if (rel.RelatedObjects && Array.isArray(rel.RelatedObjects)) {
                const psetID = rel.RelatingPropertyDefinition?.value;
                if (psetID) {
                    rel.RelatedObjects.forEach((objRef: any) => {
                        const objID = objRef.value;
                        if (!propertyMap.has(objID)) propertyMap.set(objID, []);
                        propertyMap.get(objID)!.push(psetID);
                    });
                }
            }
        }
    } catch(e) {
        console.warn("Could not build property map", e);
    }

    // Attach custom property manager
    rootGroup.userData.isIFC = true;
    rootGroup.userData.ifcAPI = api;
    rootGroup.userData.modelID = modelID;
    
    rootGroup.userData.ifcManager = {
        getItemProperties: async (id: number, expressID: number) => {
            const result: any = {};
            
            // 1. Get Direct Attributes
            try {
                const entity = api.GetLine(modelID, expressID);
                if (entity) {
                    result["GlobalId"] = entity.GlobalId?.value;
                    result["Name"] = entity.Name?.value;
                    result["Description"] = entity.Description?.value;
                    result["Tag"] = entity.Tag?.value;
                }
            } catch(e) {}

            // 2. Resolve Property Sets
            const psetIDs = propertyMap.get(expressID);
            if (psetIDs) {
                for (const psetID of psetIDs) {
                    try {
                        const pset = api.GetLine(modelID, psetID);
                        if (pset && pset.HasProperties) {
                            // pset.HasProperties is array of Property IDs
                            for (const propRef of pset.HasProperties) {
                                const propID = propRef.value;
                                const prop = api.GetLine(modelID, propID);
                                
                                // Handle IfcPropertySingleValue
                                if (prop && prop.Name && prop.NominalValue) {
                                    const key = prop.Name.value;
                                    const val = prop.NominalValue.value; 
                                    // Sometimes value is label, or bool, or number.
                                    // WebIFC returns object like { type: 1, value: "..." } or just raw value
                                    
                                    // Simple flatten
                                    result[key] = val; 
                                }
                            }
                        }
                    } catch(e) {}
                }
            }
            
            return result;
        },
        getExpressId: (geo: any, faceIndex: number) => {
            return geo.userData?.expressID;
        }
    };

    // Iterate meshes
    onProgress(40, t("converting"));
    
    let meshCount = 0;
    
    const materials: Record<string, THREE.MeshStandardMaterial> = {};
    const getMaterial = (color: number, opacity: number = 1) => {
        const key = `${color}-${opacity}`;
        if(!materials[key]) {
            materials[key] = new THREE.MeshStandardMaterial({
                color: color,
                transparent: opacity < 1,
                opacity: opacity,
                side: THREE.DoubleSide
            });
        }
        return materials[key];
    };

    const dummyMatrix = new THREE.Matrix4();

    api.StreamAllMeshes(modelID, (flatMesh: WebIFC.FlatMesh) => {
        const size = flatMesh.geometries.size();
        for (let i = 0; i < size; i++) {
            const placedGeom = flatMesh.geometries.get(i);
            const expressID = flatMesh.expressID;
            
            const geomID = placedGeom.geometryExpressID;
            const meshData = api.GetGeometry(modelID, geomID);
            
            const verts = api.GetVertexArray(meshData.GetVertexData(), meshData.GetVertexDataSize());
            const indices = api.GetIndexArray(meshData.GetIndexData(), meshData.GetIndexDataSize());
            
            const geometry = new THREE.BufferGeometry();
            
            const posFloats = new Float32Array(verts.length / 2);
            const normFloats = new Float32Array(verts.length / 2);
            
            for(let k=0; k<verts.length; k+=6) {
                posFloats[k/2] = verts[k];
                posFloats[k/2+1] = verts[k+1];
                posFloats[k/2+2] = verts[k+2];
                
                normFloats[k/2] = verts[k+3];
                normFloats[k/2+1] = verts[k+4];
                normFloats[k/2+2] = verts[k+5];
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(posFloats, 3));
            geometry.setAttribute('normal', new THREE.BufferAttribute(normFloats, 3));
            geometry.setIndex(new THREE.BufferAttribute(indices, 1));
            
            // Store ExpressID on geometry for picking logic if needed
            geometry.userData = { expressID };

            const transform = placedGeom.flatTransformation; 
            dummyMatrix.fromArray(transform);
            
            // Determine color from color in placedGeom
            const color = placedGeom.color; // {x, y, z, w}
            let material;
            if (color) {
                const hex = new THREE.Color(color.x, color.y, color.z).getHex();
                material = getMaterial(hex, color.w);
            } else {
                material = getMaterial(0xcccccc);
            }

            const mesh = new THREE.Mesh(geometry, material);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.fromArray(transform);
            mesh.matrixWorldNeedsUpdate = true; 
            
            mesh.userData.expressID = expressID; 
            mesh.name = `IFC Item ${expressID}`; 
            
            rootGroup.add(mesh);
            meshCount++;
        }
    });

    console.log(`Loaded ${meshCount} meshes from IFC.`);
    onProgress(100, t("success"));
    
    return rootGroup;
};

export const loadModelFiles = async (
    files: FileList | File[], 
    onProgress: ProgressCallback, 
    t: TFunc,
    settings: SceneSettings // Pass current settings to read Axis Config
): Promise<THREE.Group> => {
    // We create a wrapper group that will hold the loaded models.
    const container = new THREE.Group();
    container.name = "ImportedModels";

    const totalFiles = files.length;

    // 1. Load all files
    for (let i = 0; i < totalFiles; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase();
        const url = URL.createObjectURL(file);
        
        const fileBaseProgress = (i / totalFiles) * 100;
        const fileWeight = 100 / totalFiles;

        const updateFileProgress = (p: number, msg?: string) => {
            const safeP = isNaN(p) ? 0 : Math.min(1, Math.max(0, p));
            // If sub-loader provides message, use it, else default
            const status = msg || `${t("reading")} ${file.name}`;
            // Adjust local progress to global weight
            onProgress(Math.round(fileBaseProgress + (safeP * fileWeight / 100)), status);
        };
        
        updateFileProgress(0);

        let object: THREE.Object3D | null = null;
        // Determine which axis setting to use
        let axisSetting: AxisOption = '+y';

        try {
            if (ext === 'lmb' || ext === 'lmbz') {
                const loader = new LMBLoader();
                object = await loader.loadAsync(url, (p) => updateFileProgress(p * 100));
                axisSetting = '+y'; // LMB is usually Y-up native from Three.js
            } else if (ext === 'glb' || ext === 'gltf') {
                const loader = new GLTFLoader();
                const gltf = await new Promise<any>((resolve, reject) => {
                    loader.load(url, resolve, (e) => {
                        if (e.total && e.total > 0) updateFileProgress(e.loaded / e.total * 100);
                        else updateFileProgress(50); 
                    }, reject);
                });
                object = gltf.scene;
                axisSetting = settings.importAxisGLB;
            } else if (ext === 'ifc') {
                object = await loadIFC(url, updateFileProgress, t);
                axisSetting = settings.importAxisIFC;
            }

            if (object) {
                object.name = file.name;
                
                // Apply Axis Correction
                applyUpAxisCorrection(object, axisSetting);

                container.add(object);
            }
        } catch(e) {
            console.error(`Failed to load ${file.name}`, e);
        } finally {
            URL.revokeObjectURL(url);
        }
    }
    
    onProgress(100, t("analyzing"));

    // 2. Calculate World Bounds for the entire container
    // We do this to find the "Global Center" of the loaded data.
    container.updateMatrixWorld(true);
    const totalBox = new THREE.Box3();
    let hasContent = false;
    
    const tempMat = new THREE.Matrix4();

    container.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            
            // OPTIMIZATION: Re-enable frustum culling.
            mesh.frustumCulled = true;

            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
            
            if (mesh.geometry.boundingBox) {
                // Handle InstancedMesh bounds
                if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
                    const im = mesh as THREE.InstancedMesh;
                    const count = im.count;
                    // Sample instances to get an approximate bound without freezing UI on massive models
                    const step = Math.max(1, Math.floor(count / 1000));
                    
                    for(let k=0; k<count; k+=step) {
                         im.getMatrixAt(k, tempMat);
                         // Convert local instance -> World
                         tempMat.premultiply(im.matrixWorld);
                         const box = mesh.geometry.boundingBox.clone().applyMatrix4(tempMat);
                         totalBox.union(box);
                    }
                } 
                // Handle Standard Mesh
                else {
                    const box = mesh.geometry.boundingBox.clone();
                    box.applyMatrix4(mesh.matrixWorld);
                    totalBox.union(box);
                }
                hasContent = true;
            }
        }
    });

    // 3. Center the Model (Root Shift)
    // Instead of modifying internal geometry (which breaks hierarchy/messy), 
    // we simply move the CONTAINER to the negative center.
    if (hasContent && !totalBox.isEmpty()) {
        const center = totalBox.getCenter(new THREE.Vector3());
        
        console.log("Global Center found at:", center);
        
        if (center.lengthSq() > 100) { 
             // Store the offset so we can save it later (for export)
             container.userData.originalCenter = center.clone();
             
             // Move the container to (0,0,0) relative to the Scene
             // This keeps all internal parent/child relationships intact.
             // Three.js handles the chained transforms.
             container.position.copy(center).negate();
             
             // Force update matrix so the new position takes effect immediately
             container.updateMatrixWorld(true);
             
             // Update the bounding box stored on userData to represent the NEW centered state
             const centeredBox = totalBox.clone().translate(container.position);
             container.userData.boundingBox = centeredBox;
        } else {
             container.userData.boundingBox = totalBox;
        }
    }

    return container;
};

export const parseTilesetFromFolder = async (files: FileList, onProgress: ProgressCallback, t: TFunc): Promise<string | null> => {
    onProgress(10, t("analyzing"));
    
    const fileMap = new Map<string, Blob>();
    let tilesetKey = "";

    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const pathParts = f.webkitRelativePath.split('/');
        const relPath = pathParts.slice(1).join('/'); 
        
        if (relPath) {
             fileMap.set(relPath, f);
             if (f.name === 'tileset.json') tilesetKey = relPath;
        } else {
             fileMap.set(f.name, f);
             if (f.name === 'tileset.json') tilesetKey = f.name;
        }
    }

    if (!tilesetKey && fileMap.has("tileset.json")) tilesetKey = "tileset.json";

    if (!tilesetKey) {
        throw new Error("tileset.json not found in the selected folder");
    }

    onProgress(50, t("reading"));

    const blobUrlMap = new Map<string, string>();
    fileMap.forEach((blob, path) => {
        blobUrlMap.set(path, URL.createObjectURL(blob));
    });

    const tilesetFile = fileMap.get(tilesetKey);
    if (!tilesetFile) return null;

    const text = await tilesetFile.text();
    const json = JSON.parse(text);

    const replaceUris = (node: any) => {
        if (node.content && node.content.uri) {
            const m = blobUrlMap.get(node.content.uri);
            if (m) node.content.uri = m;
        }
        if (node.children) node.children.forEach(replaceUris);
    };
    replaceUris(json.root);

    onProgress(100, t("success"));
    const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
    return URL.createObjectURL(blob);
};
