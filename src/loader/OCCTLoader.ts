
import * as THREE from 'three';
import { TFunc } from "../theme/Locales";

export class OCCTLoader {
    private wasmUrl: string;

    constructor(wasmUrl: string = '/libs/occt-import-js/occt-import-js.wasm') {
        this.wasmUrl = wasmUrl;
    }

    async load(buffer: ArrayBuffer, t: TFunc, onProgress?: (p: number, msg: string) => void): Promise<THREE.Group> {
        if (onProgress) onProgress(10, t('loading_cad_engine'));

        // Load occt-import-js
        // We use dynamic import to avoid bundling issues if not used
        // @ts-ignore
        const initOCCT = (await import('occt-import-js')).default;
        const occt = await initOCCT({
            locateFile: (name: string) => {
                if (name.endsWith('.wasm')) return this.wasmUrl;
                return name;
            }
        });

        if (onProgress) onProgress(30, t('parsing_cad_data'));

        const fileContent = new Uint8Array(buffer);
        let result;
        
        // Try to read as STEP first, then IGES
        try {
            result = occt.ReadStepFile(fileContent, null);
        } catch (e) {
            console.warn('Failed to read as STEP, trying IGES...', e);
        }

        if (!result || !result.success) {
            try {
                result = occt.ReadIgesFile(fileContent, null);
            } catch (e) {
                console.error('Failed to read as IGES', e);
            }
        }

        if (!result || !result.success) {
            throw new Error(t('error_cad_parse_failed'));
        }

        if (onProgress) onProgress(70, t('creating_geometry'));

        const group = new THREE.Group();
        const material = new THREE.MeshPhongMaterial({ 
            color: 0xcccccc, 
            side: THREE.DoubleSide,
            flatShading: false,
            shininess: 30
        });

        for (const mesh of result.meshes) {
            const geometry = new THREE.BufferGeometry();
            
            // Positions
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3));
            
            // Normals
            if (mesh.attributes.normal) {
                geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3));
            } else {
                geometry.computeVertexNormals();
            }

            // Indices
            if (mesh.index) {
                geometry.setIndex(new THREE.Uint32BufferAttribute(mesh.index.array, 1));
            }

            const threeMesh = new THREE.Mesh(geometry, material.clone());
            
            // Colors
            if (mesh.color) {
                const color = new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2]);
                (threeMesh.material as THREE.MeshPhongMaterial).color = color;
            }
            
            threeMesh.name = mesh.name || 'CAD Part';
            
            // Store original CAD properties in userData
            threeMesh.userData = {
                ...mesh.userData,
                source: 'OCCT'
            };

            group.add(threeMesh);
        }

        if (onProgress) onProgress(100, t('model_loaded'));
        return group;
    }
}
