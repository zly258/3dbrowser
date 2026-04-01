import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

export async function exportGLB(root: THREE.Object3D): Promise<Blob> {
    const exporter = new GLTFExporter();
    return new Promise((resolve, reject) => {
        exporter.parse(
            root,
            (result) => {
                const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
                resolve(blob);
            },
            (err) => reject(err),
            { binary: true }
        );
    });
}

// 自定义LMB导出器实现
// 这镜像了LMB加载器结构：
// 头部：位置(3f)，颜色数量(u32)，节点数量(u32)
// 颜色：u32[]
// 节点：名称，矩阵(9f)，位置(3f)，基础顶点(3f)，顶点缩放(3f)，顶点数量(u32)，顶点(压缩)，法线(压缩)，索引，颜色索引，实例数量，实例...

export async function exportLMB(root: THREE.Object3D, onProgress: (msg: string) => void): Promise<Blob> {
    onProgress("准备LMB导出...");
    
    // 1. 展平网格
    const meshes: THREE.Mesh[] = [];
    const colors: number[] = [];
    const colorMap = new Map<string, number>();

    root.updateMatrixWorld(true);
    
    // 全局中心处理
    const globalOffset = new THREE.Vector3(0,0,0);
    if(root.userData.originalCenter) globalOffset.copy(root.userData.originalCenter);

    root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh && obj.visible) {
            meshes.push(obj as THREE.Mesh);
            const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
            const hex = mat.color ? mat.color.getHex() : 0xffffff;
            if (!colorMap.has(hex.toString())) {
                colorMap.set(hex.toString(), colors.length);
                colors.push(hex);
            }
        }
    });

    const parts: ArrayBuffer[] = [];
    const textEncoder = new TextEncoder();

    // 2. 头部
    const header = new ArrayBuffer(4 * 3 + 4 + 4);
    const headerView = new DataView(header);
    // 位置（使用全局偏移来恢复原始位置）
    headerView.setFloat32(0, globalOffset.x, true);
    headerView.setFloat32(4, globalOffset.y, true);
    headerView.setFloat32(8, globalOffset.z, true);
    headerView.setUint32(12, colors.length, true);
    headerView.setUint32(16, meshes.length, true);
    parts.push(header);

    // 3. 颜色
    const colorsBuffer = new ArrayBuffer(colors.length * 4);
    const colorsView = new DataView(colorsBuffer);
    for(let i=0; i<colors.length; i++) {
        // LMB存储颜色为(r<<16)|(g<<8)|b。THREE.Color.getHex()正好做这个。
        colorsView.setUint32(i * 4, colors[i], true);
    }
    parts.push(colorsBuffer);

    // 4. 节点
    for (let i = 0; i < meshes.length; i++) {
        const percent = Math.floor((i / meshes.length) * 100);
        if(i % 10 === 0) onProgress(`Encoding mesh ${i+1}/${meshes.length} (${percent}%)`);

        const mesh = meshes[i];
        const geo = mesh.geometry;
        if(!geo.getAttribute('position')) continue;

        const posAttr = geo.getAttribute('position');
        const normAttr = geo.getAttribute('normal');
        const indexAttr = geo.index;
        
        // 名称
        const nameBytes = textEncoder.encode(mesh.name || `Node_${i}`);
        const nameLen = new ArrayBuffer(2);
        new DataView(nameLen).setUint16(0, nameBytes.length, true);
        parts.push(nameLen);
        parts.push(nameBytes.buffer);
        
        // 填充
        const paddingLen = (4 - ((2 + nameBytes.length) % 4)) % 4;
        if(paddingLen > 0) parts.push(new Uint8Array(paddingLen).buffer);

        // 变换（矩阵 3x3）+ 位置
        // 如果 mesh 的 matrixWorld 中包含旋转/缩放，需要分解
        // LMB 以 3x3 矩阵存储旋转*缩放，并用 3f 存储位置
        const m = mesh.matrixWorld;
        const e = m.elements;
        // matrixWorld 为列主序：0,1,2（X 轴），4,5,6（Y 轴），8,9,10（Z 轴），12,13,14（位置）
        // LMB 加载器期望 9 个浮点数矩阵
        const matBuf = new ArrayBuffer(9 * 4);
        const matView = new DataView(matBuf);
        // 我们写入旋转/缩放矩阵
        const indices = [0,1,2, 4,5,6, 8,9,10];
        for(let k=0; k<9; k++) matView.setFloat32(k*4, e[indices[k]], true);
        parts.push(matBuf);

        const posBuf = new ArrayBuffer(3 * 4);
        const posView = new DataView(posBuf);
        // 写入相对于根的位置：容器已移动到原点，因此 matrixWorld 的位置相对场景为局部值
        // 头部已写入 globalOffset，用于还原到原始坐标
        posView.setFloat32(0, e[12], true);
        posView.setFloat32(4, e[13], true);
        posView.setFloat32(8, e[14], true);
        parts.push(posBuf);

        // 压缩参数计算
        // 计算顶点边界框以确定基础和缩放
        let minX=Infinity, minY=Infinity, minZ=Infinity;
        let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
        
        for(let k=0; k<posAttr.count; k++){
            const x = posAttr.getX(k);
            const y = posAttr.getY(k);
            const z = posAttr.getZ(k);
            if(x<minX) minX=x; if(y<minY) minY=y; if(z<minZ) minZ=z;
            if(x>maxX) maxX=x; if(y>maxY) maxY=y; if(z>maxZ) maxZ=z;
        }
        
        // 处理平面几何
        if(maxX === minX) maxX += 0.001;
        if(maxY === minY) maxY += 0.001;
        if(maxZ === minZ) maxZ += 0.001;

        const rangeX = (maxX - minX);
        const rangeY = (maxY - minY);
        const rangeZ = (maxZ - minZ);
        
        // 我们想要将[min, max]大致映射到int16范围。
        // 加载器逻辑：rx = baseX + qX / scaleX  => qX = (rx - baseX) * scaleX
        // 如果我们映射min->-32000和max->32000
        // 居中它。
        const baseX = (minX + maxX) / 2;
        const baseY = (minY + maxY) / 2;
        const baseZ = (minZ + maxZ) / 2;
        
        // qX范围大约是+/- (范围/2) * 缩放。我们希望这大约为32767。
        // 缩放 = 32767 / (范围/2)
        const scaleX = 32767.0 / (rangeX * 0.5);
        const scaleY = 32767.0 / (rangeY * 0.5);
        const scaleZ = 32767.0 / (rangeZ * 0.5);

        const compressionBuf = new ArrayBuffer(6 * 4);
        const compView = new DataView(compressionBuf);
        // 基础顶点
        compView.setFloat32(0, baseX, true);
        compView.setFloat32(4, baseY, true);
        compView.setFloat32(8, baseZ, true);
        // 缩放
        compView.setFloat32(12, scaleX, true);
        compView.setFloat32(16, scaleY, true);
        compView.setFloat32(20, scaleZ, true);
        parts.push(compressionBuf);

        // 顶点
        const vertCount = posAttr.count;
        const countBuf = new ArrayBuffer(4);
        new DataView(countBuf).setUint32(0, vertCount, true);
        parts.push(countBuf);
     
        const firstX = posAttr.getX(0);
        const firstY = posAttr.getY(0);
        const firstZ = posAttr.getZ(0);
        
        // 在compressionBuf中重新写入BaseVertex槽位为第一个顶点
        compView.setFloat32(0, firstX, true);
        compView.setFloat32(4, firstY, true);
        compView.setFloat32(8, firstZ, true);
        
        // 基于第一个顶点作为锚点重新计算缩放
        // qX = (x - firstX) * scaleX。
        // 最大增量 = Max(x) - firstX。最小增量 = Min(x) - firstX。
        // 范围大致相同，但偏移不同。
        const maxDeltaX = Math.max(Math.abs(maxX - firstX), Math.abs(minX - firstX));
        const maxDeltaY = Math.max(Math.abs(maxY - firstY), Math.abs(minY - firstY));
        const maxDeltaZ = Math.max(Math.abs(maxZ - firstZ), Math.abs(minZ - firstZ));
        
        // 我们需要 maxDelta * scale <= 32767
        const finalScaleX = maxDeltaX > 0.0001 ? 32767.0 / maxDeltaX : 1;
        const finalScaleY = maxDeltaY > 0.0001 ? 32767.0 / maxDeltaY : 1;
        const finalScaleZ = maxDeltaZ > 0.0001 ? 32767.0 / maxDeltaZ : 1;
        
        compView.setFloat32(12, finalScaleX, true);
        compView.setFloat32(16, finalScaleY, true);
        compView.setFloat32(20, finalScaleZ, true);

        // 写入压缩顶点（跳过第一个）
        const vertDataSize = (vertCount - 1) * 6; // 3 * 2 字节
        const vertBuf = new ArrayBuffer(vertDataSize > 0 ? vertDataSize : 0);
        if (vertDataSize > 0) {
            const vView = new DataView(vertBuf);
            for(let k=1; k<vertCount; k++) {
                const x = posAttr.getX(k);
                const y = posAttr.getY(k);
                const z = posAttr.getZ(k);
                
                // q = (x - firstX) * scaleX
                const qx = Math.round((x - firstX) * finalScaleX);
                const qy = Math.round((y - firstY) * finalScaleY);
                const qz = Math.round((z - firstZ) * finalScaleZ);
                
                const offset = (k-1)*6;
                vView.setInt16(offset, qx, true);
                vView.setInt16(offset+2, qy, true);
                vView.setInt16(offset+4, qz, true);
            }
        }
        parts.push(vertBuf);

        // 法线
        // 加载器期望每个顶点一个法线
        const normBuf = new ArrayBuffer(vertCount * 4);
        const normView = new DataView(normBuf);
        for(let k=0; k<vertCount; k++) {
            let nx = 0, ny = 0, nz = 1;
            if(normAttr) {
                nx = normAttr.getX(k);
                ny = normAttr.getY(k);
                nz = normAttr.getZ(k);
            }
            // 打包法线（加载器逻辑）
            // decodeNormal逻辑：packed = ((x+1)*511/2)<<20 | ((y+1)*511/2)<<10 | ((z+1)*511/2)
            // x,y,z在[-1,1]范围内
            const packNormal = (x:number, y:number, z:number) => {
                const bias = (v:number) => Math.max(0, Math.min(1023, Math.round((v + 1) * 511)));
                return (bias(x) << 20) | (bias(y) << 10) | bias(z);
            };
            normView.setUint32(k*4, packNormal(nx, ny, nz), true);
        }
        parts.push(normBuf);

        // 索引
        const indexCount = indexAttr ? indexAttr.count : vertCount;
        const indexSize = vertCount <= 255 ? 1 : vertCount <= 65535 ? 2 : 4;
        const indexBuf = new ArrayBuffer(indexCount * indexSize);
        const idxView = new DataView(indexBuf);
        
        if(indexAttr) {
            for(let k=0; k<indexCount; k++) {
                const idx = indexAttr.getX(k);
                if(indexSize === 1) idxView.setUint8(k, idx);
                else if(indexSize === 2) idxView.setUint16(k*2, idx, true);
                else idxView.setUint32(k*4, idx, true);
            }
        } else {
            // 没有索引缓冲区，使用顺序的
            for(let k=0; k<indexCount; k++) {
                if(indexSize === 1) idxView.setUint8(k, k);
                else if(indexSize === 2) idxView.setUint16(k*2, k, true);
                else idxView.setUint32(k*4, k, true);
            }
        }
        parts.push(indexBuf);

        // 颜色索引
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const hex = mat.color ? mat.color.getHex() : 0xffffff;
        const colorIdx = colorMap.get(hex.toString()) || 0;
        const colorIdxBuf = new ArrayBuffer(4);
        new DataView(colorIdxBuf).setUint32(0, colorIdx, true);
        parts.push(colorIdxBuf);

        // 实例（现在为0）
        const instBuf = new ArrayBuffer(4);
        new DataView(instBuf).setUint32(0, 0, true);
        parts.push(instBuf);
    }

    onProgress("完成LMB文件...");

    // 组合所有部分
    const totalSize = parts.reduce((sum, buf) => sum + buf.byteLength, 0);
    const finalBuffer = new ArrayBuffer(totalSize);
    const finalView = new Uint8Array(finalBuffer);
    let offset = 0;
    for(const buf of parts) {
        finalView.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
    }

    return new Blob([finalBuffer], { type: 'application/octet-stream' });
}




