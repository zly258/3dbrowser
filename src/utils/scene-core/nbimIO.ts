export interface NbimHeader {
    magic: number;
    version: number;
    manifestOffset: number;
    manifestLength: number;
}

export interface NbimPropertyRow {
    group: string;
    key: string;
    path: string;
    value: string;
    source?: string;
    rawKey?: string;
}

export interface NbimPropertyDocument {
    owner: string;
    bimId: string;
    uuid: string;
    name: string;
    rows: NbimPropertyRow[];
}

export interface NbimPropertyNameIndexItem {
    group: string;
    key: string;
    path: string;
    rawKey?: string;
    count: number;
}

export interface NbimManifest {
    globalBounds?: {
        min: { x: number; y: number; z: number };
        max: { x: number; y: number; z: number };
    };
    chunks?: any[];
    structureTree?: any;
    bimIdTable?: string[];
    bimProperties?: Record<string, any>;
    bimPropertyDocs?: Record<string, NbimPropertyDocument>;
    propertyNameIndex?: NbimPropertyNameIndexItem[];
    stats?: { meshes: number; faces: number; memory: number };
}

export async function readNbimHeader(file: File): Promise<NbimHeader> {
    const headerBuffer = await file.slice(0, 1024).arrayBuffer();
    const dv = new DataView(headerBuffer);
    return {
        magic: dv.getUint32(0, true),
        version: dv.getUint32(4, true),
        manifestOffset: dv.getUint32(8, true),
        manifestLength: dv.getUint32(12, true)
    };
}

export async function readNbimManifest(file: File, header: NbimHeader): Promise<NbimManifest> {
    const manifestBlob = file.slice(header.manifestOffset, header.manifestOffset + header.manifestLength);
    const manifestText = await manifestBlob.text();
    return JSON.parse(manifestText) as NbimManifest;
}

