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

    // 4. Nodes
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

        // 变换（矩阵3x3）+ 位置
        // 如果mesh的matrixWorld中有旋转/缩放，需要分解
        // 但LMB存储3x3矩阵和位置。
        // 我们将旋转*缩放存储在3x3中，位置存储在3f中。
        const m = mesh.matrixWorld;
        const e = m.elements;
        // matrixWorld是列优先：0,1,2（x轴），4,5,6（y轴），8,9,10（z轴），12,13,14（位置）
        // LMB加载器期望矩阵有9个浮点数。
        const matBuf = new ArrayBuffer(9 * 4);
        const matView = new DataView(matBuf);
        // 我们写入旋转/缩放矩阵
        const indices = [0,1,2, 4,5,6, 8,9,10];
        for(let k=0; k<9; k++) matView.setFloat32(k*4, e[indices[k]], true);
        parts.push(matBuf);

        const posBuf = new ArrayBuffer(3 * 4);
        const posView = new DataView(posBuf);
        // 写入相对于根的位置。由于我们将容器移动到原点，matrixWorld位置相对于场景是局部的。
        // 我们已经在头部写入了globalOffset。
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
        
        // 顶点数据（Int16）
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
            parts.push(vertBuf);
        }
        
        // 法线数据（Int16）
        if (normAttr) {
            const normCount = normAttr.count;
            const normFirstX = normAttr.getX(0);
            const normFirstY = normAttr.getY(0);
            const normFirstZ = normAttr.getZ(0);
            
            // 重新计算法线缩放
            let normMinX=Infinity, normMinY=Infinity, normMinZ=Infinity;
            let normMaxX=-Infinity, normMaxY=-Infinity, normMaxZ=-Infinity;
            
            for(let k=0; k<normCount; k++){
                const x = normAttr.getX(k);
                const y = normAttr.getY(k);
                const z = normAttr.getZ(k);
                if(x<normMinX) normMinX=x; if(y<normMinY) normMinY=y; if(z<normMinZ) normMinZ=z;
                if(x>normMaxX) normMaxX=x; if(y>normMaxY) normMaxY=y; if(z>normMaxZ) normMaxZ=z;
            }
            
            const normMaxDeltaX = Math.max(Math.abs(normMaxX - normFirstX), Math.abs(normMinX - normFirstX));
            const normMaxDeltaY = Math.max(Math.abs(normMaxY - normFirstY), Math.abs(normMinY - normFirstY));
            const normMaxDeltaZ = Math.max(Math.abs(normMaxZ - normFirstZ), Math.abs(normMinZ - normFirstZ));
            
            const normFinalScaleX = normMaxDeltaX > 0.0001 ? 32767.0 / normMaxDeltaX : 1;
            const normFinalScaleY = normMaxDeltaY > 0.0001 ? 32767.0 / normMaxDeltaY : 1;
            const normFinalScaleZ = normMaxDeltaZ > 0.0001 ? 32767.0 / normMaxDeltaZ : 1;
            
            // 压缩参数 - 我们使用单独的缓冲区存储法线压缩参数
            const normCompressionBuf = new ArrayBuffer(6 * 4);
            const normCompView = new DataView(normCompressionBuf);
            normCompView.setFloat32(0, normFirstX, true);
            normCompView.setFloat32(4, normFirstY, true);
            normCompView.setFloat32(8, normFirstZ, true);
            normCompView.setFloat32(12, normFinalScaleX, true);
            normCompView.setFloat32(16, normFinalScaleY, true);
            normCompView.setFloat32(20, normFinalScaleZ, true);
            parts.push(normCompressionBuf);
            
            // 顶点数据（Int16）
            const normDataSize = (normCount - 1) * 6; // 3 * 2 字节
            const normBuf = new ArrayBuffer(normDataSize > 0 ? normDataSize : 0);
            if (normDataSize > 0) {
                const nView = new DataView(normBuf);
                for(let k=1; k<normCount; k++) {
                    const x = normAttr.getX(k);
                    const y = normAttr.getY(k);
                    const z = normAttr.getZ(k);
                    
                    const qx = Math.round((x - normFirstX) * normFinalScaleX);
                    const qy = Math.round((y - normFirstY) * normFinalScaleY);
                    const qz = Math.round((z - normFirstZ) * normFinalScaleZ);
                    
                    const offset = (k-1)*6;
                    nView.setInt16(offset, qx, true);
                    nView.setInt16(offset+2, qy, true);
                    nView.setInt16(offset+4, qz, true);
                }
                parts.push(normBuf);
            }
        }
        
        // 索引数据
        if (indexAttr) {
            const indexCount = indexAttr.count;
            const indexBuf = new ArrayBuffer(4);
            new DataView(indexBuf).setUint32(0, indexCount, true);
            parts.push(indexBuf);
            
            // 检查是否需要32位索引
            const useUint32 = Math.max(...Array.from({length: indexCount}, (_, i) => indexAttr.getX(i))) > 65535;
            
            if (useUint32) {
                const indices = new Uint32Array(indexCount);
                for(let k=0; k<indexCount; k++) {
                    indices[k] = indexAttr.getX(k);
                }
                parts.push(indices.buffer);
            } else {
                const indices = new Uint16Array(indexCount);
                for(let k=0; k<indexCount; k++) {
                    indices[k] = indexAttr.getX(k);
                }
                parts.push(indices.buffer);
            }
        } else {
            // 如果没有索引，创建空的索引部分
            const indexBuf = new ArrayBuffer(4);
            new DataView(indexBuf).setUint32(0, 0, true);
            parts.push(indexBuf);
        }
        
        // 颜色索引
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const hex = mat.color ? mat.color.getHex() : 0xffffff;
        const colorIndex = colorMap.get(hex.toString()) || 0;
        const colorIndexBuf = new ArrayBuffer(4);
        new DataView(colorIndexBuf).setUint32(0, colorIndex, true);
        parts.push(colorIndexBuf);
        
        // 实例数量（用于InstancedMesh）
        let instanceCount = 1;
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
            instanceCount = (mesh as THREE.InstancedMesh).count;
        }
        const instanceCountBuf = new ArrayBuffer(4);
        new DataView(instanceCountBuf).setUint32(0, instanceCount, true);
        parts.push(instanceCountBuf);
        
        // 实例变换矩阵（如果这是InstancedMesh）
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
            const instancedMesh = mesh as THREE.InstancedMesh;
            for (let j = 0; j < instanceCount; j++) {
                const matrix = new THREE.Matrix4();
                instancedMesh.getMatrixAt(j, matrix);
                
                // 获取位置信息
                const e = matrix.elements;
                const instanceMatBuf = new ArrayBuffer(9 * 4);
                const instanceMatView = new DataView(instanceMatBuf);
                
                // 写入旋转/缩放矩阵
                const indices = [0,1,2, 4,5,6, 8,9,10];
                for(let k=0; k<9; k++) instanceMatView.setFloat32(k*4, e[indices[k]], true);
                parts.push(instanceMatBuf);
                
                const instancePosBuf = new ArrayBuffer(3 * 4);
                const instancePosView = new DataView(instancePosBuf);
                instancePosView.setFloat32(0, e[12], true);
                instancePosView.setFloat32(4, e[13], true);
                instancePosView.setFloat32(8, e[14], true);
                parts.push(instancePosBuf);
            }
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
        result.set(new Uint8Array(part), offset);
        offset += part.byteLength;
    }
    
    onProgress("LMB导出完成!");
    return new Blob([result], { type: "application/octet-stream" });
}