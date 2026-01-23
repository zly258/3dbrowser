import * as THREE from "three";

/**
 * 将3D场景导出为LMB格式
 * @param root 3D对象根节点
 * @param onProgress 进度回调函数
 * @returns 包含LMB数据的Blob
 */
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

    const parts: Uint8Array[] = [];
    const textEncoder = new TextEncoder();

    // 2. 头部
    const header = new Uint8Array(4 * 3 + 4 + 4);
    const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);
    // 位置（使用全局偏移来恢复原始位置）
    headerView.setFloat32(0, globalOffset.x, true);
    headerView.setFloat32(4, globalOffset.y, true);
    headerView.setFloat32(8, globalOffset.z, true);
    headerView.setUint32(12, colors.length, true);
    headerView.setUint32(16, meshes.length, true);
    parts.push(header);

    // 3. 颜色
    const colorsBuffer = new Uint8Array(colors.length * 4);
    const colorsView = new DataView(colorsBuffer.buffer, colorsBuffer.byteOffset, colorsBuffer.byteLength);
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
        const nameLen = new Uint8Array(2);
        new DataView(nameLen.buffer, nameLen.byteOffset, nameLen.byteLength).setUint16(0, nameBytes.length, true);
        parts.push(nameLen);
        parts.push(nameBytes);
        
        // 填充
        const paddingLen = (4 - ((2 + nameBytes.length) % 4)) % 4;
        if(paddingLen > 0) parts.push(new Uint8Array(paddingLen));

        // 变换（矩阵3x3）+ 位置
        const m = mesh.matrixWorld;
        const e = m.elements;
        const matBuf = new Uint8Array(9 * 4);
        const matView = new DataView(matBuf.buffer, matBuf.byteOffset, matBuf.byteLength);
        const indices = [0,1,2, 4,5,6, 8,9,10];
        for(let k=0; k<9; k++) matView.setFloat32(k*4, e[indices[k]], true);
        parts.push(matBuf);

        const posBuf = new Uint8Array(3 * 4);
        const posView = new DataView(posBuf.buffer, posBuf.byteOffset, posBuf.byteLength);
        posView.setFloat32(0, e[12], true);
        posView.setFloat32(4, e[13], true);
        posView.setFloat32(8, e[14], true);
        parts.push(posBuf);
        
        // 顶点压缩参数的基础点
        const firstX = posAttr.getX(0);
        const firstY = posAttr.getY(0);
        const firstZ = posAttr.getZ(0);

        // 计算压缩缩放因子
        let minX=Infinity, minY=Infinity, minZ=Infinity;
        let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
        
        for(let k=0; k<posAttr.count; k++){
            const x = posAttr.getX(k);
            const y = posAttr.getY(k);
            const z = posAttr.getZ(k);
            if(x<minX) minX=x; if(y<minY) minY=y; if(z<minZ) minZ=z;
            if(x>maxX) maxX=x; if(y>maxY) maxY=y; if(z>maxZ) maxZ=z;
        }
        
        const maxDeltaX = Math.max(Math.abs(maxX - firstX), Math.abs(minX - firstX));
        const maxDeltaY = Math.max(Math.abs(maxY - firstY), Math.abs(minY - firstY));
        const maxDeltaZ = Math.max(Math.abs(maxZ - firstZ), Math.abs(minZ - firstZ));
        
        const finalScaleX = maxDeltaX > 0.0001 ? 32767.0 / maxDeltaX : 1;
        const finalScaleY = maxDeltaY > 0.0001 ? 32767.0 / maxDeltaY : 1;
        const finalScaleZ = maxDeltaZ > 0.0001 ? 32767.0 / maxDeltaZ : 1;

        const compressionBuf = new Uint8Array(6 * 4);
        const compView = new DataView(compressionBuf.buffer, compressionBuf.byteOffset, compressionBuf.byteLength);
        compView.setFloat32(0, firstX, true);
        compView.setFloat32(4, firstY, true);
        compView.setFloat32(8, firstZ, true);
        compView.setFloat32(12, finalScaleX, true);
        compView.setFloat32(16, finalScaleY, true);
        compView.setFloat32(20, finalScaleZ, true);
        parts.push(compressionBuf);

        // 顶点
        const vertCount = posAttr.count;
        const countBuf = new Uint8Array(4);
        new DataView(countBuf.buffer, countBuf.byteOffset, countBuf.byteLength).setUint32(0, vertCount, true);
        parts.push(countBuf);
        
        // 顶点数据（Int16）
        const vertDataSize = (vertCount - 1) * 6;
        if (vertDataSize > 0) {
            const vertBuf = new Uint8Array(vertDataSize);
            const vView = new DataView(vertBuf.buffer, vertBuf.byteOffset, vertBuf.byteLength);
            for(let k=1; k<vertCount; k++) {
                const x = posAttr.getX(k);
                const y = posAttr.getY(k);
                const z = posAttr.getZ(k);
                const qx = Math.round((x - firstX) * finalScaleX);
                const qy = Math.round((y - firstY) * finalScaleY);
                const qz = Math.round((z - firstZ) * finalScaleZ);
                const offset = (k-1)*6;
                vView.setInt16(offset, qx, true);
                vView.setInt16(offset+2, qy, true);
                vView.setInt16(offset+4, qz, true);
            }
            parts.push(vertBuf);
        }

        // 字节对齐
        let currentOffset = 0;
        parts.forEach(p => currentOffset += p.byteLength);
        const alignmentPadding = (4 - (currentOffset % 4)) % 4;
        if(alignmentPadding > 0) parts.push(new Uint8Array(alignmentPadding));
        
        // 法线数据（Uint32 打包）
        const normBuf = new Uint8Array(vertCount * 4);
        const nView = new DataView(normBuf.buffer, normBuf.byteOffset, normBuf.byteLength);
        for(let k=0; k<vertCount; k++) {
            let nx = 0, ny = 0, nz = 1;
            if (normAttr) {
                nx = normAttr.getX(k);
                ny = normAttr.getY(k);
                nz = normAttr.getZ(k);
            }
            // 编码法线（10-10-10 位）
            const scale = 511.0;
            let x = Math.round(nx * scale);
            let y = Math.round(ny * scale);
            let z = Math.round(nz * scale);
            x = Math.max(-512, Math.min(511, x));
            y = Math.max(-512, Math.min(511, y));
            z = Math.max(-512, Math.min(511, z));
            const ux = (x < 0 ? x + 1024 : x) & 0x3ff;
            const uy = (y < 0 ? y + 1024 : y) & 0x3ff;
            const uz = (z < 0 ? z + 1024 : z) & 0x3ff;
            const packed = (ux << 20) | (uy << 10) | uz;
            nView.setUint32(k * 4, packed, true);
        }
        parts.push(normBuf);

        // 索引数据
        const indexCount = indexAttr ? indexAttr.count : 0;
        const indexCountBuf = new Uint8Array(4);
        new DataView(indexCountBuf.buffer, indexCountBuf.byteOffset, indexCountBuf.byteLength).setUint32(0, indexCount, true);
        parts.push(indexCountBuf);
        
        if (indexCount > 0) {
            const indexSize = vertCount <= 255 ? 1 : vertCount <= 65535 ? 2 : 4;
            const indexBuf = new Uint8Array(indexCount * indexSize);
            const iView = new DataView(indexBuf.buffer, indexBuf.byteOffset, indexBuf.byteLength);
            for(let k=0; k<indexCount; k++) {
                const val = indexAttr!.getX(k);
                if (indexSize === 1) iView.setUint8(k, val);
                else if (indexSize === 2) iView.setUint16(k * 2, val, true);
                else iView.setUint32(k * 4, val, true);
            }
            parts.push(indexBuf);
            
            // 索引后的字节对齐 - LMB Loader 只有在 indexSize < 4 时才对齐
            if (indexSize < 4) {
                let currentOffsetAfterIndex = 0;
                parts.forEach(p => currentOffsetAfterIndex += p.byteLength);
                const alignmentPaddingAfterIndex = (4 - (currentOffsetAfterIndex % 4)) % 4;
                if(alignmentPaddingAfterIndex > 0) parts.push(new Uint8Array(alignmentPaddingAfterIndex));
            }
        }
        
        // 颜色索引
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const hex = mat.color ? mat.color.getHex() : 0xffffff;
        const colorIndex = colorMap.get(hex.toString()) || 0;
        const colorIndexBuf = new Uint8Array(4);
        new DataView(colorIndexBuf.buffer, colorIndexBuf.byteOffset, colorIndexBuf.byteLength).setUint32(0, colorIndex, true);
        parts.push(colorIndexBuf);
        
        // 实例数量
        let instances: {matrix: THREE.Matrix4, name: string, colorIndex: number}[] = [];
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
            const instancedMesh = mesh as THREE.InstancedMesh;
            // 跳过第0个实例，因为它被视为基础节点（对齐 LMBLoader 逻辑）
            for (let j = 1; j < instancedMesh.count; j++) {
                const matrix = new THREE.Matrix4();
                instancedMesh.getMatrixAt(j, matrix);
                instances.push({
                    matrix,
                    name: `${mesh.name}_instance_${j}`,
                    colorIndex: colorIndex // 简化处理，使用相同颜色
                });
            }
        }

        const instanceCountBuf = new Uint8Array(4);
        new DataView(instanceCountBuf.buffer, instanceCountBuf.byteOffset, instanceCountBuf.byteLength).setUint32(0, instances.length, true);
        parts.push(instanceCountBuf);
        
        // 实例数据
        for (const instance of instances) {
            const instNameBytes = textEncoder.encode(instance.name);
            const instNameLen = new Uint8Array(2);
            new DataView(instNameLen.buffer, instNameLen.byteOffset, instNameLen.byteLength).setUint16(0, instNameBytes.length, true);
            parts.push(instNameLen);
            parts.push(instNameBytes);
            
            const instPadding = (4 - ((2 + instNameBytes.length) % 4)) % 4;
            if(instPadding > 0) parts.push(new Uint8Array(instPadding));

            const e = instance.matrix.elements;
            const instMatBuf = new Uint8Array(9 * 4);
            const instMatView = new DataView(instMatBuf.buffer, instMatBuf.byteOffset, instMatBuf.byteLength);
            const indices = [0,1,2, 4,5,6, 8,9,10];
            for(let k=0; k<9; k++) instMatView.setFloat32(k*4, e[indices[k]], true);
            parts.push(instMatBuf);
            
            const instPosBuf = new Uint8Array(3 * 4);
            const instPosView = new DataView(instPosBuf.buffer, instPosBuf.byteOffset, instPosBuf.byteLength);
            instPosView.setFloat32(0, e[12], true);
            instPosView.setFloat32(4, e[13], true);
            instPosView.setFloat32(8, e[14], true);
            parts.push(instPosBuf);

            const instColorBuf = new Uint8Array(4);
            new DataView(instColorBuf.buffer, instColorBuf.byteOffset, instColorBuf.byteLength).setUint32(0, instance.colorIndex, true);
            parts.push(instColorBuf);
        }
    }
    
    // 合并所有部分
    let totalSize = 0;
    parts.forEach(part => {
        totalSize += part.byteLength;
    });
    
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    
    onProgress("LMB导出完成!");
    return new Blob([result], { type: "application/octet-stream" });
}
