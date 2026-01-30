import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import { TilesGroup } from '3d-tiles-renderer';
import { TilesRenderer } from '3d-tiles-renderer';

export declare const colors: ThemeColors;

export declare const createGlobalStyle: (theme: ThemeColors) => string;

export declare const createStyles: (theme: ThemeColors) => {
    container: {
        display: string;
        flexDirection: "column";
        height: string;
        width: string;
        backgroundColor: string;
        color: string;
        fontSize: string;
        fontFamily: string;
        userSelect: "none";
        overflow: string;
    };
    classicMenuBar: {
        display: string;
        alignItems: string;
        backgroundColor: string;
        borderBottom: string;
        padding: string;
        height: string;
        gap: string;
        WebkitAppRegion: any;
    };
    classicMenuItem: (active: boolean, hover: boolean) => {
        padding: string;
        height: string;
        display: string;
        alignItems: string;
        fontSize: string;
        color: string;
        cursor: string;
        backgroundColor: string;
        transition: string;
    };
    classicMenuDropdown: {
        position: "absolute";
        top: string;
        left: number;
        backgroundColor: string;
        border: string;
        boxShadow: string;
        zIndex: number;
        minWidth: string;
        padding: string;
    };
    classicMenuSubItem: (hover: boolean) => {
        padding: string;
        fontSize: string;
        color: string;
        cursor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        backgroundColor: string;
    };
    statusBar: {
        height: string;
        backgroundColor: string;
        color: string;
        display: string;
        alignItems: string;
        padding: string;
        fontSize: string;
        justifyContent: string;
        borderTop: string;
    };
    statusBarRight: {
        display: string;
        alignItems: string;
        gap: string;
    };
    statusMonitorItem: {
        display: string;
        alignItems: string;
        gap: string;
        fontFamily: string;
        opacity: number;
    };
    toolbarBtn: {
        display: string;
        alignItems: string;
        justifyContent: string;
        width: string;
        height: string;
        borderRadius: string;
        cursor: string;
        color: string;
        backgroundColor: string;
        transition: string;
        border: string;
        outline: string;
        position: "relative";
        WebkitAppRegion: any;
    };
    toolbarBtnHover: {
        backgroundColor: string;
        color: string;
    };
    checkboxContainer: {
        display: string;
        alignItems: string;
        gap: string;
        cursor: string;
        userSelect: "none";
        fontSize: string;
        color: string;
        padding: string;
    };
    checkboxCustom: (checked: boolean) => {
        width: string;
        height: string;
        borderRadius: string;
        border: string;
        backgroundColor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        transition: string;
        position: "relative";
        cursor: string;
    };
    checkboxCheckmark: {
        width: string;
        height: string;
        color: string;
        display: string;
        alignItems: string;
        justifyContent: string;
    };
    floatingPanel: {
        position: "absolute";
        backgroundColor: string;
        border: string;
        boxShadow: string;
        borderRadius: string;
        display: string;
        flexDirection: "column";
        zIndex: number;
        minWidth: string;
        minHeight: string;
        overflow: string;
        color: string;
    };
    floatingHeader: {
        height: string;
        padding: string;
        backgroundColor: string;
        borderBottom: string;
        cursor: string;
        fontWeight: string;
        display: string;
        justifyContent: string;
        alignItems: string;
        userSelect: "none";
        fontSize: string;
        color: string;
    };
    floatingContent: {
        padding: string;
        overflowY: "auto";
        flex: number;
        position: "relative";
        display: string;
        flexDirection: "column";
    };
    resizeHandle: {
        position: "absolute";
        bottom: number;
        right: number;
        width: string;
        height: string;
        cursor: string;
        zIndex: number;
        background: string;
    };
    treeContainer: {
        flex: number;
        height: string;
        overflowY: "auto";
        overflowX: "hidden";
        padding: string;
    };
    treeNode: (selected: boolean, hover: boolean) => {
        display: string;
        alignItems: string;
        height: string;
        cursor: string;
        whiteSpace: "nowrap";
        fontSize: string;
        color: string;
        backgroundColor: string;
        transition: string;
        paddingRight: string;
        fontWeight: string;
    };
    expander: {
        width: string;
        height: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        cursor: string;
        color: string;
    };
    nodeLabel: {
        flex: number;
        overflow: string;
        textOverflow: string;
    };
    list: {
        flex: number;
        overflowY: "auto";
        padding: string;
        userSelect: "text";
    };
    propGroupTitle: {
        backgroundColor: string;
        padding: string;
        fontWeight: "600";
        fontSize: string;
        color: string;
        borderBottom: string;
        borderTop: string;
        marginTop: string;
        cursor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        userSelect: "none";
    };
    propRow: {
        display: string;
        padding: string;
        borderBottom: string;
        alignItems: string;
        fontSize: string;
        gap: string;
    };
    propKey: {
        width: string;
        color: string;
        overflow: string;
        textOverflow: string;
        whiteSpace: "nowrap";
    };
    propValue: {
        width: string;
        color: string;
        whiteSpace: "nowrap";
        overflow: string;
        textOverflow: string;
        cursor: string;
    };
    btn: {
        backgroundColor: string;
        color: string;
        border: string;
        padding: string;
        cursor: string;
        borderRadius: string;
        fontSize: string;
        fontWeight: string;
        transition: string;
        outline: string;
        display: string;
        alignItems: string;
        justifyContent: string;
    };
    btnActive: {
        backgroundColor: string;
        color: string;
        borderColor: string;
    };
    viewGridBtn: {
        display: string;
        flexDirection: "column";
        alignItems: string;
        justifyContent: string;
        backgroundColor: string;
        border: string;
        borderRadius: string;
        padding: string;
        cursor: string;
        transition: string;
        color: string;
        fontSize: string;
        height: string;
        gap: string;
    };
    modalOverlay: {
        position: "fixed";
        top: number;
        left: number;
        right: number;
        bottom: number;
        backgroundColor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        zIndex: number;
    };
    modalContent: {
        backgroundColor: string;
        border: string;
        boxShadow: string;
        borderRadius: string;
        display: string;
        flexDirection: "column";
        width: string;
        maxHeight: string;
        overflow: string;
        color: string;
    };
    overlay: {
        position: "absolute";
        top: number;
        left: number;
        right: number;
        bottom: number;
        backgroundColor: string;
        display: string;
        alignItems: string;
        justifyContent: string;
        zIndex: number;
    };
    progressBox: {
        width: string;
        backgroundColor: string;
        padding: string;
        borderRadius: string;
        border: string;
        boxShadow: string;
        color: string;
    };
    progressBarContainer: {
        height: string;
        backgroundColor: string;
        borderRadius: string;
        overflow: string;
        marginTop: string;
    };
    progressBarFill: {
        height: string;
        backgroundColor: string;
        transition: string;
    };
    sliderRow: {
        display: string;
        alignItems: string;
        gap: string;
        marginBottom: string;
    };
    sliderLabel: {
        fontSize: string;
        color: string;
        width: string;
    };
    rangeSlider: {
        flex: number;
        cursor: string;
        height: string;
        outline: string;
    };
    statsOverlay: {
        position: "absolute";
        top: string;
        left: string;
        transform: string;
        backgroundColor: string;
        color: string;
        display: string;
        flexDirection: "row";
        alignItems: string;
        gap: string;
        padding: string;
        fontSize: string;
        zIndex: number;
        pointerEvents: "none";
        borderRadius: string;
        border: string;
        boxShadow: string;
    };
    statsRow: {
        display: string;
        alignItems: string;
        gap: string;
        whiteSpace: "nowrap";
    };
    statsDivider: {
        width: string;
        height: string;
        backgroundColor: string;
    };
};

export declare const DEFAULT_FONT = "'Segoe UI', 'Microsoft YaHei', sans-serif";

export declare const getTranslation: (lang: Lang, key: string) => string;

/**
 * 本地化翻译资源
 * 包含中英文双语支持
 */
export declare type Lang = 'zh' | 'en';

export declare interface LoadedItem {
    name: string;
    uuid: string;
    type: "MODEL" | "TILES";
    object?: THREE.Object3D;
}

export declare const loadModelFiles: (files: (File | string)[], onProgress: ProgressCallback, t: TFunc, _settings: SceneSettings, libPath?: string) => Promise<THREE.Object3D[]>;

export declare interface MeasurementRecord {
    id: string;
    type: string;
    val: string;
    group: THREE.Group;
}

export declare type MeasureType = 'dist' | 'angle' | 'coord' | 'none';

export declare const parseTilesetFromFolder: (files: FileList, onProgress: ProgressCallback, t: TFunc) => Promise<string | null>;

export declare type ProgressCallback = (percent: number, msg?: string) => void;

export declare class SceneManager {
    canvas: HTMLCanvasElement;
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
    contentGroup: THREE.Group;
    helpersGroup: THREE.Group;
    measureGroup: THREE.Group;
    ghostGroup: THREE.Group;
    clipHelpersGroup: THREE.Group;
    ambientLight: THREE.AmbientLight;
    dirLight: THREE.DirectionalLight;
    backLight: THREE.DirectionalLight;
    structureRoot: StructureTreeNode;
    private nodeMap;
    private bimIdToNodeIds;
    tilesRenderer: TilesRenderer | null;
    selectionBox: THREE.Box3Helper;
    highlightMesh: THREE.Mesh;
    private lastSelectedUuid;
    private highlightedUuids;
    raycaster: THREE.Raycaster;
    mouse: THREE.Vector2;
    measureType: MeasureType;
    currentMeasurePoints: THREE.Vector3[];
    previewLine: THREE.Line | null;
    tempMarker: THREE.Points;
    measureRecords: Map<string, MeasurementRecord>;
    clippingPlanes: THREE.Plane[];
    clipPlaneHelpers: THREE.Mesh[];
    sceneCenter: THREE.Vector3;
    globalOffset: THREE.Vector3;
    componentMap: Map<number | string, any>;
    optimizedMapping: Map<string, {
        mesh: THREE.BatchedMesh;
        instanceId: number;
        originalColor: number;
        geometry?: THREE.BufferGeometry;
    }[]>;
    settings: SceneSettings;
    dotTexture: THREE.Texture;
    sceneBounds: THREE.Box3;
    precomputedBounds: THREE.Box3;
    private chunks;
    private processingChunks;
    private cancelledChunkIds;
    private frustum;
    private projScreenMatrix;
    private logicTimer;
    private nbimFiles;
    private nbimMeta;
    private nbimPropsByOriginalUuid;
    private sharedMaterial;
    onTilesUpdate?: () => void;
    onStructureUpdate?: () => void;
    onChunkProgress?: (loaded: number, total: number) => void;
    private lastReportedProgress;
    private chunkPadding;
    private maxConcurrentChunkLoads;
    private maxChunkLoadsPerFrame;
    private chunkLoadingEnabled;
    constructor(canvas: HTMLCanvasElement);
    updateSettings(newSettings: Partial<SceneSettings>): void;
    createCircleTexture(): any;
    animate(): void;
    updateCameraClipping(): void;
    resize(width?: number, height?: number): void;
    private reportChunkProgress;
    private checkCullingAndLoad;
    private loadChunk;
    setChunkLoadingEnabled(enabled: boolean): void;
    setContentVisible(visible: boolean): void;
    private buildSceneGraph;
    /**
     * 构建基于 IFC 图层和空间结构的复合树
     */
    /**
     * 构建基于 IFC 图层和空间结构的复合树
     */
    private buildIFCStructure;
    addModel(object: THREE.Object3D, onProgress?: (p: number, msg: string) => void): Promise<void>;
    removeObject(uuid: string): boolean;
    removeModel(uuid: string): Promise<boolean>;
    addTileset(url: string, onProgress?: (p: number, msg: string) => void): TilesGroup;
    private getTypeIndex;
    private guessType;
    private generateChunkBinaryV8;
    private parseChunkBinaryV7;
    private parseChunkBinaryV8;
    exportNbim(): Promise<void>;
    loadNbim(file: File, onProgress?: (p: number, msg: string) => void): Promise<void>;
    clear(): Promise<void>;
    getStructureNodes(id: string): StructureTreeNode[] | undefined;
    getNbimProperties(id: string): any | null;
    setAllVisibility(visible: boolean): void;
    hideObjects(uuids: string[]): void;
    isolateObjects(uuids: string[]): void;
    setObjectVisibility(uuid: string, visible: boolean): void;
    highlightObject(uuid: string | null): void;
    highlightObjects(uuids: string[]): void;
    pick(clientX: number, clientY: number): {
        object: THREE.Object3D;
        intersect: THREE.Intersection;
    } | null;
    getRayIntersects(clientX: number, clientY: number): THREE.Intersection | null;
    computeTotalBounds(onlyVisible?: boolean, forceRecompute?: boolean): THREE.Box3;
    updateSceneBounds(): void;
    fitView(keepOrientation?: boolean): void;
    fitViewToObject(uuid: string): void;
    fitBox(box: THREE.Box3, updateCameraPosition?: boolean): void;
    setView(view: string): void;
    startMeasurement(type: MeasureType): void;
    addMeasurePoint(point: THREE.Vector3): {
        id: string;
        type: string;
        val: string;
    } | null;
    updateMeasureHover(clientX: number, clientY: number): void;
    updatePreviewLine(hoverPoint?: THREE.Vector3): void;
    finalizeMeasurement(): {
        id: string;
        type: MeasureType;
        val: string;
    };
    private createLabel;
    highlightMeasurement(id: string | null): void;
    pickMeasurement(clientX: number, clientY: number): string | null;
    addMarker(point: THREE.Vector3, parent: THREE.Object3D): void;
    addLine(points: THREE.Vector3[], parent: THREE.Object3D): void;
    removeMeasurement(id: string): void;
    clearAllMeasurements(): void;
    clearMeasurementPreview(): void;
    setupClipping(): void;
    setClippingEnabled(enabled: boolean): void;
    updateClippingPlanes(bounds: THREE.Box3, values: {
        x: number[];
        y: number[];
        z: number[];
    }, active: {
        x: boolean;
        y: boolean;
        z: boolean;
    }): void;
    private updatePlaneHelper;
    /**
     * 检查包围盒是否完全被当前剖切面裁剪掉
     * 如果包围盒完全在任意一个激活的剖切面的“背面”，则认为被裁剪
     */
    private isBoxClipped;
    getStats(): {
        meshes: number;
        faces: number;
        memory: number;
        drawCalls: any;
    };
    dispose(): void;
}

export declare interface SceneSettings {
    ambientInt: number;
    dirInt: number;
    bgColor: string;
    viewCubeSize?: number;
    frustumCulling?: boolean;
}

export declare interface StructureTreeNode {
    id: string;
    name: string;
    type: 'Mesh' | 'Group';
    children?: StructureTreeNode[];
    bimId?: string;
    chunkId?: string;
    visible?: boolean;
    userData?: any;
}

export declare type TFunc = (key: string) => string;

export declare interface ThemeColors {
    bg: string;
    panelBg: string;
    headerBg: string;
    border: string;
    text: string;
    textLight: string;
    textMuted: string;
    accent: string;
    highlight: string;
    itemHover: string;
    success: string;
    warning: string;
    danger: string;
    canvasBg: string;
    shadow: string;
}

export declare const themes: Record<'dark' | 'light', ThemeColors>;

export declare const ThreeViewer: ({ allowDragOpen, hiddenMenus, libPath, defaultTheme, defaultLang, showStats: propShowStats, showOutline: propShowOutline, showProperties: propShowProperties, initialSettings, initialFiles, onSelect: propOnSelect, onLoad }: ThreeViewerProps) => any;

export declare interface ThreeViewerProps {
    allowDragOpen?: boolean;
    hiddenMenus?: string[];
    libPath?: string;
    defaultTheme?: 'dark' | 'light';
    defaultLang?: Lang;
    showStats?: boolean;
    showOutline?: boolean;
    showProperties?: boolean;
    initialSettings?: Partial<SceneSettings>;
    initialFiles?: (string | File) | (string | File)[];
    onSelect?: (uuid: string, object: any) => void;
    onLoad?: (manager: SceneManager) => void;
}

export { }
