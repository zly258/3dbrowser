import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import React, { useRef, useCallback, useState, useEffect, useMemo, Component } from 'react';
import * as THREE from 'three';
import { O as OrbitControls } from './loaders-MBHA5ASo.js';
import { TilesRenderer } from '3d-tiles-renderer';
import { c as calculateGeometryMemory, b as buildOctree, a as collectLeafNodes, d as createBatchedMeshFromItemsAsync, e as collectItemsBatched, f as collectItems, g as convertLMBTo3DTiles, h as exportGLB, i as exportLMB } from './utils-D0sDuH7g.js';

class SceneManager {
  constructor(canvas) {
    this.structureRoot = { id: "root", name: "Root", type: "Group", children: [] };
    this.nodeMap = /* @__PURE__ */ new Map();
    this.bimIdToNodeIds = /* @__PURE__ */ new Map();
    this.tilesRenderer = null;
    this.lastSelectedUuid = null;
    this.highlightedUuids = /* @__PURE__ */ new Set();
    this.measureType = "none";
    this.currentMeasurePoints = [];
    this.currentMeasureModelUuid = null;
    this.previewLine = null;
    this.previewPolygon = null;
    this.measureRecords = /* @__PURE__ */ new Map();
    this.boxSelectState = {
      active: false,
      startX: 0,
      startY: 0,
      endX: 0,
      endY: 0,
      rectElement: null
    };
    this.clippingPlanes = [];
    this.clipPlaneHelpers = [];
    this.sceneCenter = new THREE.Vector3();
    this.globalOffset = new THREE.Vector3();
    this.componentMap = /* @__PURE__ */ new Map();
    this.optimizedMapping = /* @__PURE__ */ new Map();
    this.settings = {
      ambientInt: 2,
      dirInt: 1,
      bgColor: "#edf0f3",
      viewCubeSize: 100,
      colorSpace: "srgb",
      toneMapping: "aces",
      exposure: 1,
      shadowQuality: "medium",
      adaptiveQuality: true,
      minPixelRatio: 0.8,
      maxPixelRatio: 2,
      targetFps: 50,
      maxRenderDistance: 1e6
      // 增加默认渲染距离到 1km (针对 mm 单位)
    };
    this.sceneBounds = new THREE.Box3();
    this.cachedSceneSphere = new THREE.Sphere();
    this.sceneSphereValid = false;
    this.precomputedBounds = new THREE.Box3();
    this.chunks = [];
    this.processingChunks = /* @__PURE__ */ new Set();
    this.cancelledChunkIds = /* @__PURE__ */ new Set();
    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this.logicTimer = null;
    this.nbimFiles = /* @__PURE__ */ new Map();
    this.nbimMeta = /* @__PURE__ */ new Map();
    this.nbimPropsByOriginalUuid = /* @__PURE__ */ new Map();
    this.sharedMaterial = new THREE.MeshStandardMaterial({
      color: 14277857,
      roughness: 0.82,
      metalness: 0.03,
      side: THREE.DoubleSide
    });
    this.interactableList = [];
    this.interactableListValid = false;
    this._needsBoundsUpdate = false;
    this.lastReportedProgress = { loaded: -1, total: -1 };
    this.chunkLoadedCount = 0;
    this.chunkPadding = 0.2;
    this.maxConcurrentChunkLoads = 128;
    this.maxChunkLoadsPerFrame = 64;
    this.maxLoadedChunks = 512;
    this.maxCachedChunks = 48;
    this.chunkLoadingEnabled = true;
    this.maxRenderDistance = 1e6;
    this._lastCullingTime = 0;
    this.chunkMeshCache = /* @__PURE__ */ new Map();
    this.chunkCacheOrder = [];
    this.originalStats = { meshes: 0, faces: 0, memory: 0 };
    this.originalStatsByModel = /* @__PURE__ */ new Map();
    this.workers = [];
    this.workerQueue = [];
    this.activeWorkerCount = 0;
    this.maxWorkers = 4;
    this.frameSampleTime = performance.now();
    this.frameCounter = 0;
    this.fps = 0;
    this.isCameraMoving = false;
    this.activePixelRatio = 1;
    this.chunkLoadResumeAt = 0;
    this.cullingDirty = true;
    this.deferredStructureThreshold = 2e4;
    this.octreeWorkerThreshold = 25e3;
    this.initialChunkLoadTarget = 18;
    this.warmupChunkBoost = 8;
    this.chunkWarmupActive = false;
    this.chunkResidencyMs = 1800;
    this.chunkRuntimeProfiles = {
      compact: {
        name: "compact",
        movingFocusCentralityThreshold: 0.16,
        movingFocusPixelThreshold: 24,
        chunkVisibilityHoldMs: 180,
        centerPriorityThreshold: 0.52,
        forwardPriorityThreshold: 0.64,
        movingCoreCentralityThreshold: 0.5,
        movingCorePixelThreshold: 36,
        movingCoreForwardThreshold: 0.58,
        movingPeripheralRefreshMs: 140,
        movingPeripheralBatchRatio: 0.24,
        movingPeripheralMinBatchSize: 40,
        movingCullingIntervalMs: 34,
        recoveryCullingIntervalMs: 58,
        idleCullingIntervalMs: 120,
        resumeAfterMoveMs: 90,
        postMoveRecoveryMs: 320,
        centerPriorityWindowMs: 180,
        movingLoadBudgetMin: 2,
        movingLoadBudgetMax: 8,
        recoveryLoadBudgetMin: 4,
        recoveryLoadBudgetMax: 12,
        recoveryLoadBudgetRatio: 0.45
      },
      balanced: {
        name: "balanced",
        movingFocusCentralityThreshold: 0.18,
        movingFocusPixelThreshold: 28,
        chunkVisibilityHoldMs: 220,
        centerPriorityThreshold: 0.58,
        forwardPriorityThreshold: 0.68,
        movingCoreCentralityThreshold: 0.54,
        movingCorePixelThreshold: 42,
        movingCoreForwardThreshold: 0.62,
        movingPeripheralRefreshMs: 180,
        movingPeripheralBatchRatio: 0.18,
        movingPeripheralMinBatchSize: 64,
        movingCullingIntervalMs: 40,
        recoveryCullingIntervalMs: 72,
        idleCullingIntervalMs: 140,
        resumeAfterMoveMs: 110,
        postMoveRecoveryMs: 480,
        centerPriorityWindowMs: 240,
        movingLoadBudgetMin: 2,
        movingLoadBudgetMax: 6,
        recoveryLoadBudgetMin: 4,
        recoveryLoadBudgetMax: 10,
        recoveryLoadBudgetRatio: 0.36
      },
      massive: {
        name: "massive",
        movingFocusCentralityThreshold: 0.2,
        movingFocusPixelThreshold: 32,
        chunkVisibilityHoldMs: 260,
        centerPriorityThreshold: 0.62,
        forwardPriorityThreshold: 0.72,
        movingCoreCentralityThreshold: 0.58,
        movingCorePixelThreshold: 48,
        movingCoreForwardThreshold: 0.66,
        movingPeripheralRefreshMs: 220,
        movingPeripheralBatchRatio: 0.12,
        movingPeripheralMinBatchSize: 96,
        movingCullingIntervalMs: 46,
        recoveryCullingIntervalMs: 88,
        idleCullingIntervalMs: 180,
        resumeAfterMoveMs: 130,
        postMoveRecoveryMs: 620,
        centerPriorityWindowMs: 300,
        movingLoadBudgetMin: 2,
        movingLoadBudgetMax: 5,
        recoveryLoadBudgetMin: 3,
        recoveryLoadBudgetMax: 8,
        recoveryLoadBudgetRatio: 0.28
      }
    };
    this.movingPeripheralCursor = 0;
    this.movingPeripheralLastRefreshAt = 0;
    this.postMoveRecoveryUntil = 0;
    this.chunkCullingTempSize = new THREE.Vector3();
    this.chunkCullingTempDirection = new THREE.Vector3();
    this.chunkCullingTempForward = new THREE.Vector3();
    this.chunkCullingTempCenterNdc = new THREE.Vector3();
    this.boundsScanBatchSize = 2400;
    this.chunkRegistrationBatchSize = 18;
    this.chunkGhostBatchSize = 24;
    this.canvas = canvas;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    this.dotTexture = this.createCircleTexture();
    this.clock = new THREE.Clock();
    this.initHardwareProfile();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: false,
      // 正交相机不建议开启对数深度缓冲区，会导致 negative near 裁剪问题
      precision: "highp",
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(this.settings.bgColor);
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.activePixelRatio = this.renderer.getPixelRatio();
    this.scene = new THREE.Scene();
    this.contentGroup = new THREE.Group();
    this.contentGroup.name = "Content";
    this.scene.add(this.contentGroup);
    this.helpersGroup = new THREE.Group();
    this.helpersGroup.name = "Helpers";
    this.scene.add(this.helpersGroup);
    this.measureGroup = new THREE.Group();
    this.measureGroup.name = "Measure";
    this.scene.add(this.measureGroup);
    this.ghostGroup = new THREE.Group();
    this.ghostGroup.name = "Ghost";
    this.scene.add(this.ghostGroup);
    this.clipHelpersGroup = new THREE.Group();
    this.clipHelpersGroup.name = "ClipHelpers";
    this.scene.add(this.clipHelpersGroup);
    const frustumSize = 100;
    const aspect = width / height;
    this.camera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      frustumSize / -2,
      -1e6,
      1e6
    );
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(1e3, -1e3, 1e3);
    this.camera.lookAt(0, 0, 0);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.screenSpacePanning = true;
    this.controls.maxPolarAngle = Math.PI;
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: void 0
    };
    this.controls.addEventListener("start", () => {
      const profile = this.getChunkRuntimeProfile();
      this.isCameraMoving = true;
      this.chunkLoadResumeAt = performance.now() + profile.resumeAfterMoveMs;
      this.postMoveRecoveryUntil = 0;
      this.movingPeripheralLastRefreshAt = 0;
      this.movingPeripheralCursor = 0;
      this.cullingDirty = true;
    });
    this.controls.addEventListener("change", () => {
      const profile = this.getChunkRuntimeProfile();
      this.isCameraMoving = true;
      this.chunkLoadResumeAt = performance.now() + profile.resumeAfterMoveMs;
      this.postMoveRecoveryUntil = 0;
      this.cullingDirty = true;
    });
    this.controls.addEventListener("end", () => {
      const now = performance.now();
      const profile = this.getChunkRuntimeProfile();
      this.isCameraMoving = false;
      this.chunkLoadResumeAt = now + Math.max(24, Math.floor(profile.resumeAfterMoveMs * 0.75));
      this.postMoveRecoveryUntil = now + profile.postMoveRecoveryMs;
      this.movingPeripheralLastRefreshAt = 0;
      this.movingPeripheralCursor = 0;
      this.cullingDirty = true;
    });
    this.ambientLight = new THREE.AmbientLight(16251131, this.settings.ambientInt);
    this.scene.add(this.ambientLight);
    this.dirLight = new THREE.DirectionalLight(16776438, this.settings.dirInt);
    this.dirLight.position.set(60, 45, 110);
    this.scene.add(this.dirLight);
    this.backLight = new THREE.DirectionalLight(15331062, 0.5);
    this.backLight.position.set(-40, -35, 30);
    this.scene.add(this.backLight);
    this.sunLight = new THREE.DirectionalLight(16774373, 1.5);
    this.sunLight.position.set(100, 100, 50);
    this.sunLight.visible = false;
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 0.1;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.camera.left = -100;
    this.sunLight.shadow.camera.right = 100;
    this.sunLight.shadow.camera.top = 100;
    this.sunLight.shadow.camera.bottom = -100;
    this.sunLight.shadow.bias = -5e-4;
    this.scene.add(this.sunLight);
    const box = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
    this.selectionBox = new THREE.Box3Helper(box, new THREE.Color(16776960));
    this.selectionBox.visible = false;
    this.helpersGroup.add(this.selectionBox);
    const highlightMat = new THREE.MeshBasicMaterial({
      color: 16755200,
      transparent: true,
      opacity: 0.3,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.highlightMesh = new THREE.Mesh(new THREE.BufferGeometry(), highlightMat);
    this.highlightMesh.visible = false;
    this.highlightMesh.renderOrder = 999;
    this.helpersGroup.add(this.highlightMesh);
    const markerGeo = new THREE.BufferGeometry();
    markerGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const markerMat = new THREE.PointsMaterial({
      color: 16711680,
      size: 8,
      sizeAttenuation: false,
      map: this.dotTexture,
      transparent: true,
      alphaTest: 0.5,
      depthTest: false
    });
    this.tempMarker = new THREE.Points(markerGeo, markerMat);
    this.tempMarker.visible = false;
    this.tempMarker.renderOrder = 1e3;
    this.helpersGroup.add(this.tempMarker);
    this.setupClipping();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 10;
    if (!this.raycaster.params.Line) this.raycaster.params.Line = { threshold: 1 };
    this.raycaster.params.Line.threshold = 2;
    this.mouse = new THREE.Vector2();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.ambientLight.intensity = this.settings.ambientInt;
    this.dirLight.intensity = this.settings.dirInt;
    this.renderer.outputColorSpace = this.settings.colorSpace === "linear" ? THREE.LinearSRGBColorSpace : THREE.SRGBColorSpace;
    this.renderer.toneMapping = this.settings.toneMapping === "none" ? THREE.NoToneMapping : this.settings.toneMapping === "neutral" ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.settings.exposure ?? 1;
    if (newSettings.sunEnabled !== void 0 || newSettings.sunLatitude !== void 0 || newSettings.sunLongitude !== void 0 || newSettings.sunTime !== void 0 || newSettings.sunShadow !== void 0) {
      this.updateSunPosition();
    }
    this.renderer.setClearColor(this.settings.bgColor);
    if (newSettings.frustumCulling !== void 0) {
      this.contentGroup.traverse((obj) => {
        if (obj.isMesh) {
          obj.frustumCulled = newSettings.frustumCulling;
        } else if (obj.isBatchedMesh) {
          obj.frustumCulled = false;
        }
      });
    }
    if (newSettings.maxRenderDistance !== void 0) {
      this.maxRenderDistance = newSettings.maxRenderDistance;
      this.checkCullingAndLoad();
    }
    if (newSettings.shadowQuality !== void 0 || newSettings.sunShadow !== void 0) {
      this.updateSunShadow();
    }
    this.renderer.render(this.scene, this.camera);
  }
  // 根据经纬度和时间计算太阳位置
  updateSunPosition() {
    const lat = this.settings.sunLatitude || 0;
    const lng = this.settings.sunLongitude || 0;
    const time = this.settings.sunTime !== void 0 ? this.settings.sunTime : 12;
    const enabled = this.settings.sunEnabled !== false;
    this.sunLight.visible = enabled;
    if (!enabled) {
      this.dirLight.intensity = this.settings.dirInt;
      return;
    }
    const hourAngle = (time - 12) * 15 * (Math.PI / 180);
    const sunElevation = 90 - Math.abs(lat) + 23.5 * Math.sin((time - 6) * 15 * (Math.PI / 180));
    const elevationRad = sunElevation * (Math.PI / 180);
    const azimuthAngle = hourAngle + lng * Math.PI / 180;
    const distance = 100;
    const x = distance * Math.cos(elevationRad) * Math.sin(azimuthAngle);
    const y = distance * Math.sin(elevationRad);
    const z = distance * Math.cos(elevationRad) * Math.cos(azimuthAngle);
    this.sunLight.position.set(x, Math.max(y, 1), z);
    const intensity = Math.max(0.2, Math.sin(elevationRad)) * 2;
    this.sunLight.intensity = intensity;
    const sunColor = new THREE.Color();
    if (time < 7 || time > 18) {
      sunColor.setHex(16755302);
    } else if (time < 9 || time > 16) {
      sunColor.setHex(16764040);
    } else {
      sunColor.setHex(16774373);
    }
    this.sunLight.color = sunColor;
    this.dirLight.intensity = this.settings.dirInt * 0.3;
    this.updateSunShadow();
  }
  // 更新阴影设置
  updateSunShadow() {
    const shadowEnabled = this.settings.shadowQuality !== "off" && this.settings.sunShadow === true && this.settings.sunEnabled !== false;
    const shadowMapSize = this.settings.shadowQuality === "high" ? 4096 : this.settings.shadowQuality === "low" ? 1024 : 2048;
    if (shadowEnabled) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.sunLight.shadow.mapSize.width = shadowMapSize;
      this.sunLight.shadow.mapSize.height = shadowMapSize;
      this.contentGroup.traverse((obj) => {
        if (obj.isMesh) {
          const mesh = obj;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      this.sunLight.castShadow = true;
    } else {
      this.renderer.shadowMap.enabled = false;
      this.sunLight.castShadow = false;
    }
  }
  createCircleTexture() {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (context) {
      context.beginPath();
      context.arc(size / 2, size / 2, size / 2 - 2, 0, 2 * Math.PI);
      context.fillStyle = "#ffffff";
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }
  animate() {
    requestAnimationFrame(this.animate);
    this.frameCounter++;
    const frameNow = performance.now();
    if (frameNow - this.frameSampleTime >= 500) {
      this.fps = this.frameCounter * 1e3 / (frameNow - this.frameSampleTime);
      this.frameCounter = 0;
      this.frameSampleTime = frameNow;
    }
    if (this.controls) {
      this.controls.update();
    }
    this.updateAdaptiveQuality();
    if (this._needsBoundsUpdate) {
      this.updateSceneBounds();
      this._needsBoundsUpdate = false;
    }
    this.updateCameraClipping();
    const now = performance.now();
    const profile = this.getChunkRuntimeProfile();
    const cullingInterval = this.cullingDirty ? this.isCameraMoving ? profile.movingCullingIntervalMs : this.isInPostMoveRecovery(now) ? profile.recoveryCullingIntervalMs : Math.min(profile.recoveryCullingIntervalMs, 70) : profile.idleCullingIntervalMs;
    if (!this._lastCullingTime || now - this._lastCullingTime > cullingInterval) {
      this.checkCullingAndLoad(now);
      this._lastCullingTime = now;
      this.cullingDirty = false;
    }
    if (this.tilesRenderer) {
      this.camera.updateMatrixWorld();
      this.tilesRenderer.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
  updateAdaptiveQuality() {
    if (!this.settings.adaptiveQuality) return;
    const deviceRatio = window.devicePixelRatio || 1;
    const minRatio = Math.min(deviceRatio, this.settings.minPixelRatio ?? 0.8);
    const maxRatio = Math.min(deviceRatio, this.settings.maxPixelRatio ?? 2);
    const targetFps = this.settings.targetFps ?? 50;
    let desiredRatio = maxRatio;
    if (this.isCameraMoving) {
      desiredRatio = Math.max(minRatio, maxRatio * 0.65);
    } else if (this.fps > 0 && this.fps < targetFps - 5) {
      desiredRatio = Math.max(minRatio, this.activePixelRatio - 0.1);
    } else if (this.fps > targetFps + 8) {
      desiredRatio = Math.min(maxRatio, this.activePixelRatio + 0.05);
    }
    desiredRatio = Math.max(minRatio, Math.min(maxRatio, desiredRatio));
    if (Math.abs(desiredRatio - this.activePixelRatio) < 0.05) return;
    this.activePixelRatio = desiredRatio;
    this.renderer.setPixelRatio(desiredRatio);
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  }
  initHardwareProfile() {
    const nav = navigator;
    const cpuCount = Math.max(2, nav.hardwareConcurrency || 4);
    const memoryGb = nav.deviceMemory || 8;
    this.maxWorkers = Math.max(2, Math.min(8, Math.floor(cpuCount / 2)));
    this.maxConcurrentChunkLoads = Math.max(16, Math.min(96, cpuCount * 8));
    this.maxChunkLoadsPerFrame = Math.max(8, Math.min(32, cpuCount * 2));
    this.maxLoadedChunks = memoryGb <= 4 ? 160 : memoryGb <= 8 ? 320 : 640;
    this.maxCachedChunks = memoryGb <= 4 ? 24 : memoryGb <= 8 ? 48 : 96;
  }
  collectObjectOverview(object) {
    let meshes = 0;
    let faces = 0;
    let memory = 0;
    object.traverse((child) => {
      const mesh = child;
      if (!mesh.isMesh || !mesh.geometry) return;
      meshes++;
      if (mesh.geometry.index) {
        faces += mesh.geometry.index.count / 3;
      } else if (mesh.geometry.attributes.position) {
        faces += mesh.geometry.attributes.position.count / 3;
      }
      memory += calculateGeometryMemory(mesh.geometry);
    });
    return {
      meshes,
      faces: Math.floor(faces),
      memory: parseFloat(memory.toFixed(2))
    };
  }
  countStructureRenderableNodes(node) {
    if (!node) return 0;
    let count = node.type === "Mesh" ? 1 : 0;
    if (node.children) {
      for (const child of node.children) {
        count += this.countStructureRenderableNodes(child);
      }
    }
    return count;
  }
  async estimateNbimStats(file, chunks, version) {
    let meshes = 0;
    let faces = 0;
    let memory = 0;
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      const buffer = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
      const dv = new DataView(buffer);
      let offset = 0;
      const geoCount = dv.getUint32(offset, true);
      offset += 4;
      const geometryFaces = [];
      for (let i = 0; i < geoCount; i++) {
        const vertCount = dv.getUint32(offset, true);
        offset += 4;
        const indexCount = dv.getUint32(offset, true);
        offset += 4;
        offset += vertCount * 12;
        offset += vertCount * 12;
        if (indexCount > 0) offset += indexCount * 4;
        geometryFaces.push(indexCount > 0 ? indexCount / 3 : vertCount / 3);
      }
      const instanceCount = dv.getUint32(offset, true);
      offset += 4;
      meshes += instanceCount;
      memory += chunk.byteLength / (1024 * 1024);
      for (let i = 0; i < instanceCount; i++) {
        offset += 4;
        offset += 4;
        offset += 4;
        offset += 64;
        const geoIdx = dv.getUint32(offset, true);
        offset += 4;
        faces += geometryFaces[geoIdx] || 0;
      }
      if (chunkIndex > 0 && chunkIndex % 8 === 0) {
        await this.yieldToMainThread();
      }
    }
    return {
      meshes,
      faces: Math.floor(faces),
      memory: parseFloat(memory.toFixed(2))
    };
  }
  registerOriginalStats(originalUuid, stats) {
    this.originalStatsByModel.set(originalUuid, stats);
    this.originalStats.meshes += stats.meshes;
    this.originalStats.faces += stats.faces;
    this.originalStats.memory = parseFloat((this.originalStats.memory + stats.memory).toFixed(2));
  }
  unregisterOriginalStats(originalUuid) {
    const stats = this.originalStatsByModel.get(originalUuid);
    if (!stats) return;
    this.originalStats.meshes = Math.max(0, this.originalStats.meshes - stats.meshes);
    this.originalStats.faces = Math.max(0, this.originalStats.faces - stats.faces);
    this.originalStats.memory = parseFloat(Math.max(0, this.originalStats.memory - stats.memory).toFixed(2));
    this.originalStatsByModel.delete(originalUuid);
  }
  disposeChunkMesh(mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material && mesh.material !== this.sharedMaterial) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((m) => m.dispose && m.dispose());
    }
  }
  touchChunkCache(chunkId) {
    this.chunkCacheOrder = this.chunkCacheOrder.filter((id) => id !== chunkId);
    this.chunkCacheOrder.push(chunkId);
  }
  cacheChunkMesh(chunk, mesh) {
    if (this.chunkMeshCache.has(chunk.id)) {
      const oldMesh = this.chunkMeshCache.get(chunk.id);
      if (oldMesh !== mesh) this.disposeChunkMesh(oldMesh);
    }
    this.chunkMeshCache.set(chunk.id, mesh);
    this.touchChunkCache(chunk.id);
    while (this.chunkCacheOrder.length > this.maxCachedChunks) {
      const evictId = this.chunkCacheOrder.shift();
      if (!evictId) break;
      const cached = this.chunkMeshCache.get(evictId);
      if (!cached) continue;
      this.chunkMeshCache.delete(evictId);
      this.disposeChunkMesh(cached);
    }
  }
  takeCachedChunkMesh(chunkId) {
    const mesh = this.chunkMeshCache.get(chunkId) || null;
    if (!mesh) return null;
    this.chunkMeshCache.delete(chunkId);
    this.chunkCacheOrder = this.chunkCacheOrder.filter((id) => id !== chunkId);
    return mesh;
  }
  clearChunkCache(filter) {
    for (const [chunkId, mesh] of this.chunkMeshCache.entries()) {
      if (filter && !filter(chunkId, mesh)) continue;
      this.disposeChunkMesh(mesh);
      this.chunkMeshCache.delete(chunkId);
    }
    this.chunkCacheOrder = this.chunkCacheOrder.filter((chunkId) => this.chunkMeshCache.has(chunkId));
  }
  unregisterOptimizedMeshMapping(bm) {
    const batchIdToUuid = bm.userData.batchIdToUuid;
    if (!batchIdToUuid) return;
    for (const [batchId, originalUuid] of batchIdToUuid.entries()) {
      const mapping = this.optimizedMapping.get(originalUuid);
      if (!mapping) continue;
      const index = mapping.findIndex((m) => m.mesh === bm && m.instanceId === batchId);
      if (index !== -1) mapping.splice(index, 1);
      if (mapping.length === 0) this.optimizedMapping.delete(originalUuid);
    }
  }
  registerOptimizedMeshMapping(bm) {
    const batchIdToUuid = bm.userData.batchIdToUuid;
    const batchIdToColor = bm.userData.batchIdToColor;
    const batchIdToGeometry = bm.userData.batchIdToGeometry;
    if (!batchIdToUuid) return;
    for (const [batchId, originalUuid] of batchIdToUuid.entries()) {
      if (!this.optimizedMapping.has(originalUuid)) {
        this.optimizedMapping.set(originalUuid, []);
      }
      const originalColor = batchIdToColor?.get(batchId) ?? 16777215;
      const geometry = batchIdToGeometry?.get(batchId);
      this.optimizedMapping.get(originalUuid).push({
        mesh: bm,
        instanceId: batchId,
        originalColor,
        geometry
      });
    }
  }
  ensureChunkGhost(chunk) {
    if (this.ghostGroup.getObjectByName(`ghost_${chunk.id}`)) return;
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    chunk.bounds.getSize(size);
    chunk.bounds.getCenter(center);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 4674921, transparent: true, opacity: 0.3 })
    );
    edges.name = `ghost_${chunk.id}`;
    edges.scale.copy(size);
    edges.position.copy(center);
    this.ghostGroup.add(edges);
  }
  attachStructureRoot(modelRoot) {
    if (modelRoot.name === "Root" && modelRoot.children && modelRoot.children.length > 0) {
      if (!this.structureRoot.children) this.structureRoot.children = [];
      this.structureRoot.children.push(...modelRoot.children);
    } else {
      if (!this.structureRoot.children) this.structureRoot.children = [];
      this.structureRoot.children.push(modelRoot);
    }
  }
  replaceStructureNode(targetId, replacement) {
    const replaceInNodes = (nodes) => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === targetId) {
          nodes[i] = replacement;
          return true;
        }
        if (nodes[i].children && replaceInNodes(nodes[i].children)) return true;
      }
      return false;
    };
    if (this.structureRoot.children) {
      replaceInNodes(this.structureRoot.children);
    }
  }
  buildAndRegisterModelStructure(object) {
    let modelRoot;
    if (object.userData.isIFC) {
      modelRoot = this.buildIFCStructure(object);
    } else {
      modelRoot = this.buildSceneGraph(object);
    }
    const markOriginalUuid = (node) => {
      if (!node.userData) node.userData = {};
      node.userData.originalUuid = object.uuid;
      if (node.children) node.children.forEach(markOriginalUuid);
    };
    markOriginalUuid(modelRoot);
    const indexBimIds = (node) => {
      if (node.bimId) {
        const key = `${object.uuid}::${node.bimId}`;
        if (!this.bimIdToNodeIds.has(key)) this.bimIdToNodeIds.set(key, []);
        this.bimIdToNodeIds.get(key).push(node.id);
      }
      if (node.children) node.children.forEach(indexBimIds);
    };
    indexBimIds(modelRoot);
    return modelRoot;
  }
  async yieldToMainThread() {
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  createPreviewGhost(bounds, name) {
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 9741240, transparent: true, opacity: 0.45 })
    );
    edges.name = name;
    edges.scale.copy(size);
    edges.position.copy(center);
    this.ghostGroup.add(edges);
    return edges;
  }
  async computeItemBoundsProgressively(items, onProgress) {
    const bounds = new THREE.Box3();
    const tmpMin = new THREE.Vector3();
    const tmpMax = new THREE.Vector3();
    const tmpScale = new THREE.Vector3();
    for (let start = 0; start < items.length; start += this.boundsScanBatchSize) {
      const end = Math.min(items.length, start + this.boundsScanBatchSize);
      for (let itemIndex = start; itemIndex < end; itemIndex++) {
        const item = items[itemIndex];
        const center = item.center;
        let r = 0;
        const geo = item.geometry;
        if (!geo.boundingSphere) geo.computeBoundingSphere();
        if (geo.boundingSphere) {
          tmpScale.setFromMatrixScale(item.matrix);
          const maxScale = Math.max(tmpScale.x, tmpScale.y, tmpScale.z);
          r = geo.boundingSphere.radius * maxScale;
        }
        tmpMin.set(center.x - r, center.y - r, center.z - r);
        tmpMax.set(center.x + r, center.y + r, center.z + r);
        bounds.expandByPoint(tmpMin);
        bounds.expandByPoint(tmpMax);
      }
      if (onProgress && items.length > 0) {
        onProgress(20 + Math.min(12, Math.floor(end / items.length * 12)), "正在统计大模型范围...");
      }
      if (end < items.length) {
        await this.yieldToMainThread();
      }
    }
    bounds.min.subScalar(0.1);
    bounds.max.addScalar(0.1);
    return bounds;
  }
  async createChunkGhostsProgressively(ghostSpecs) {
    if (ghostSpecs.length === 0) return;
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);
    const boxMat = new THREE.LineBasicMaterial({ color: 4674921, transparent: true, opacity: 0.3 });
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (let start = 0; start < ghostSpecs.length; start += this.chunkGhostBatchSize) {
      const end = Math.min(ghostSpecs.length, start + this.chunkGhostBatchSize);
      for (let index = start; index < end; index++) {
        const spec = ghostSpecs[index];
        const chunk = this.chunks.find((c) => c.id === spec.chunkId);
        if (!chunk || chunk.loaded || this.cancelledChunkIds.has(spec.chunkId)) continue;
        if (this.ghostGroup.getObjectByName(`ghost_${spec.chunkId}`)) continue;
        spec.bounds.getSize(size);
        spec.bounds.getCenter(center);
        const edges = new THREE.LineSegments(edgesGeo, boxMat);
        edges.name = `ghost_${spec.chunkId}`;
        edges.scale.copy(size);
        edges.position.copy(center);
        this.ghostGroup.add(edges);
      }
      if (end < ghostSpecs.length) {
        await this.yieldToMainThread();
      }
    }
  }
  async registerLeafChunksProgressively(object, leafNodes, onProgress) {
    const ghostSpecs = [];
    for (let start = 0; start < leafNodes.length; start += this.chunkRegistrationBatchSize) {
      const end = Math.min(leafNodes.length, start + this.chunkRegistrationBatchSize);
      for (let index = start; index < end; index++) {
        const node = leafNodes[index];
        const chunkId = `${object.uuid}_chunk_${index}`;
        const chunkBounds = node.bounds.clone();
        node.items.forEach((item) => {
          const treeNodes = this.nodeMap.get(item.uuid);
          if (treeNodes) {
            treeNodes.forEach((treeNode) => {
              if (treeNode.bimId === void 0) {
                treeNode.bimId = treeNode.id;
              }
              treeNode.chunkId = chunkId;
            });
          }
        });
        const paddedBounds = chunkBounds.clone();
        const padSize = chunkBounds.getSize(new THREE.Vector3()).multiplyScalar(this.chunkPadding);
        paddedBounds.expandByVector(padSize);
        this.chunks.push({
          id: chunkId,
          bounds: chunkBounds,
          paddedBounds,
          _padding: this.chunkPadding,
          center: chunkBounds.getCenter(new THREE.Vector3()),
          loaded: false,
          node,
          groupName: `optimized_${object.uuid}`,
          originalUuid: object.uuid
        });
        ghostSpecs.push({ chunkId, bounds: chunkBounds });
      }
      if (onProgress && leafNodes.length > 0) {
        onProgress(40 + Math.floor(end / leafNodes.length * 50), `正在生成分块... (${end}/${leafNodes.length})`);
      }
      if (end < leafNodes.length) {
        await this.yieldToMainThread();
      }
    }
    return ghostSpecs;
  }
  async buildLeafPlans(items, bounds, maxItemsPerNode, maxDepth) {
    if (items.length < this.octreeWorkerThreshold) {
      const octree = buildOctree(items, bounds, { maxItemsPerNode, maxDepth });
      return collectLeafNodes(octree).map((node) => ({
        bounds: node.bounds,
        level: node.level,
        items: node.items
      }));
    }
    const centers = new Float32Array(items.length * 3);
    const radii = new Float32Array(items.length);
    for (let i = 0; i < items.length; i++) {
      const center = items[i].center;
      centers[i * 3] = center.x;
      centers[i * 3 + 1] = center.y;
      centers[i * 3 + 2] = center.z;
      radii[i] = 0;
      if (i > 0 && i % 16e3 === 0) {
        await this.yieldToMainThread();
      }
    }
    const result = await this.runWorkerTask({
      taskType: "buildOctreePlan",
      centers,
      radii,
      bounds: [
        bounds.min.x,
        bounds.min.y,
        bounds.min.z,
        bounds.max.x,
        bounds.max.y,
        bounds.max.z
      ],
      maxItemsPerNode,
      maxDepth
    }, [centers.buffer, radii.buffer]);
    const leaves = [];
    for (let i = 0; i < result.length; i++) {
      const leaf = result[i];
      leaves.push({
        bounds: new THREE.Box3(
          new THREE.Vector3(leaf.bounds[0], leaf.bounds[1], leaf.bounds[2]),
          new THREE.Vector3(leaf.bounds[3], leaf.bounds[4], leaf.bounds[5])
        ),
        level: leaf.level,
        items: Array.from(leaf.itemIndices, (itemIndex) => items[itemIndex])
      });
      if (i > 0 && i % 120 === 0) {
        await this.yieldToMainThread();
      }
    }
    return leaves;
  }
  updateCameraClipping() {
    if (!this.sceneBounds || this.sceneBounds.isEmpty()) return;
    if (!this.sceneSphereValid) {
      this.sceneBounds.getBoundingSphere(this.cachedSceneSphere);
      this.sceneSphereValid = true;
    }
    const dist = this.camera.position.distanceTo(this.cachedSceneSphere.center);
    const range = Math.max(this.cachedSceneSphere.radius * 20, dist + this.cachedSceneSphere.radius * 5);
    const threshold = 0.01;
    if (Math.abs(this.camera.far - range) / Math.max(this.camera.far, 1) > threshold || Math.abs(this.camera.near - -range) / Math.max(Math.abs(this.camera.near), 1) > threshold) {
      this.camera.near = -range;
      this.camera.far = range;
      this.camera.updateProjectionMatrix();
    }
  }
  resize(width, height) {
    if (!this.canvas) return;
    let w = width;
    let h = height;
    if (w === void 0 || h === void 0) {
      const rect = this.canvas.parentElement?.getBoundingClientRect() || this.canvas.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
    }
    w = Math.max(1, w);
    h = Math.max(1, h);
    if (w === 0 || h === 0) return;
    const aspect = w / h;
    const cam = this.camera;
    const currentHeight = cam.top - cam.bottom;
    const halfHeight = currentHeight / 2;
    const halfWidth = halfHeight * aspect;
    cam.left = -halfWidth;
    cam.right = halfWidth;
    cam.top = halfHeight;
    cam.bottom = -halfHeight;
    cam.updateProjectionMatrix();
    const maxRatio = this.settings.adaptiveQuality ? Math.min(window.devicePixelRatio, this.settings.maxPixelRatio ?? 2) : Math.min(window.devicePixelRatio, 2);
    this.activePixelRatio = maxRatio;
    this.renderer.setPixelRatio(maxRatio);
    this.renderer.setSize(w, h, false);
    if (this.controls) {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }
  reportChunkProgress() {
    const total = this.chunks.length;
    const loaded = this.chunkLoadedCount;
    if (this.onChunkProgress && (loaded !== this.lastReportedProgress.loaded || total !== this.lastReportedProgress.total)) {
      this.lastReportedProgress = { loaded, total };
      this.onChunkProgress(loaded, total);
    }
  }
  getChunkRuntimeProfile(chunkCount = this.chunks.length) {
    if (chunkCount > 2e3) return this.chunkRuntimeProfiles.massive;
    if (chunkCount > 600) return this.chunkRuntimeProfiles.balanced;
    return this.chunkRuntimeProfiles.compact;
  }
  isInPostMoveRecovery(now) {
    return !this.isCameraMoving && now < this.postMoveRecoveryUntil;
  }
  isMovingPeripheralChunk(centrality, pixelSize, forwardness, profile) {
    return centrality < profile.movingCoreCentralityThreshold && pixelSize < profile.movingCorePixelThreshold && forwardness < profile.movingCoreForwardThreshold;
  }
  shouldRefreshPeripheralChunk(now, chunkIndex, totalChunks, profile) {
    if (!this.isCameraMoving || totalChunks === 0) return true;
    if (now - this.movingPeripheralLastRefreshAt >= profile.movingPeripheralRefreshMs) {
      const batchSize2 = Math.min(
        totalChunks,
        Math.max(profile.movingPeripheralMinBatchSize, Math.ceil(totalChunks * profile.movingPeripheralBatchRatio))
      );
      this.movingPeripheralCursor = (this.movingPeripheralCursor + batchSize2) % totalChunks;
      this.movingPeripheralLastRefreshAt = now;
    }
    const batchSize = Math.min(
      totalChunks,
      Math.max(profile.movingPeripheralMinBatchSize, Math.ceil(totalChunks * profile.movingPeripheralBatchRatio))
    );
    const start = this.movingPeripheralCursor;
    const end = start + batchSize;
    if (end <= totalChunks) {
      return chunkIndex >= start && chunkIndex < end;
    }
    return chunkIndex >= start || chunkIndex < end % totalChunks;
  }
  checkCullingAndLoad(now = performance.now()) {
    if (!this.chunkLoadingEnabled) return;
    if (this.chunks.length === 0) return;
    this.reportChunkProgress();
    if (this.processingChunks.size >= this.maxConcurrentChunkLoads) return;
    const profile = this.getChunkRuntimeProfile();
    this.camera.updateMatrixWorld();
    this.projScreenMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
    const padding = this.chunkPadding;
    const cameraPos = this.camera.position;
    const cameraForward = this.chunkCullingTempForward;
    this.camera.getWorldDirection(cameraForward);
    const toChunkDirection = this.chunkCullingTempDirection;
    const tempSize = this.chunkCullingTempSize;
    const tempCenterNdc = this.chunkCullingTempCenterNdc;
    const viewHeight = (this.camera.top - this.camera.bottom) / this.camera.zoom;
    const canvasHeight = this.renderer.domElement.clientHeight;
    const toLoad = [];
    const loadedChunks = [];
    const isClippingActive = this.renderer.clippingPlanes.length > 0;
    const totalChunks = this.chunks.length;
    this.chunks.forEach((c, chunkIndex) => {
      if (!c.paddedBounds || c._padding !== padding) {
        const size = c.bounds.getSize(tempSize);
        const pb = c.bounds.clone();
        pb.expandByVector(size.multiplyScalar(padding));
        c.paddedBounds = pb;
        c._padding = padding;
      }
      if (!c.center) c.center = c.bounds.getCenter(new THREE.Vector3());
      const inFrustum = this.frustum.intersectsBox(c.paddedBounds);
      const isClipped = isClippingActive && this.isBoxClipped(c.bounds);
      toChunkDirection.copy(c.center).sub(cameraPos);
      const dist = toChunkDirection.length();
      const inRange = dist < this.maxRenderDistance;
      const boxSize = c.bounds.getSize(tempSize).length();
      const pixelSize = boxSize / viewHeight * canvasHeight;
      const centerNDC = tempCenterNdc.copy(c.center).applyMatrix4(this.projScreenMatrix);
      const ndcDistance = Math.sqrt(centerNDC.x * centerNDC.x + centerNDC.y * centerNDC.y);
      const centrality = 1 - Math.min(1, ndcDistance);
      const forwardness = dist > 1e-5 ? Math.max(0, cameraForward.dot(toChunkDirection.divideScalar(dist))) : 1;
      const isTooSmall = pixelSize < 4;
      const shouldHidePeripheralWhileMoving = this.isCameraMoving && centrality < profile.movingFocusCentralityThreshold && pixelSize < profile.movingFocusPixelThreshold;
      const shouldBeVisible = inFrustum && !isClipped && inRange && !isTooSmall && !shouldHidePeripheralWhileMoving;
      const lastTouchedAt = Math.max(c.lastVisibleAt || 0, c.lastFocusAt || 0);
      const shouldKeepVisibleWhileMoving = this.isCameraMoving && inFrustum && !isClipped && inRange && !isTooSmall && now - lastTouchedAt < profile.chunkVisibilityHoldMs;
      const isPeripheralWhileMoving = this.isMovingPeripheralChunk(centrality, pixelSize, forwardness, profile);
      const shouldRefreshPeripheral = !isPeripheralWhileMoving || this.shouldRefreshPeripheralChunk(now, chunkIndex, totalChunks, profile);
      const effectiveVisible = this.isCameraMoving && isPeripheralWhileMoving && !shouldRefreshPeripheral ? c.lastEffectiveVisible ?? c.mesh?.visible ?? false : shouldBeVisible || shouldKeepVisibleWhileMoving;
      const centerPriorityWindow = this.chunkWarmupActive || now < this.chunkLoadResumeAt + profile.centerPriorityWindowMs;
      const isPeripheralCandidate = centrality < profile.centerPriorityThreshold && forwardness < profile.forwardPriorityThreshold && pixelSize < 96;
      if (effectiveVisible) {
        c.lastVisibleAt = now;
      }
      if (centrality > 0.42 || forwardness > 0.55) {
        c.lastFocusAt = now;
      }
      c.lastEffectiveVisible = effectiveVisible;
      if (c.loaded) {
        loadedChunks.push(c);
        if (c.mesh) {
          if (c.mesh.visible !== effectiveVisible) {
            c.mesh.visible = effectiveVisible;
          }
        } else {
          const optimizedGroup = this.contentGroup.getObjectByName(c.groupName);
          const bm = optimizedGroup?.getObjectByName(c.id);
          if (bm) {
            c.mesh = bm;
            bm.visible = effectiveVisible;
          }
        }
      } else if (!this.processingChunks.has(c.id) && shouldBeVisible) {
        const viewportBoost = centrality > 0.8 ? 4.5 : centrality > 0.62 ? 2.8 : 1;
        const sizeScore = Math.min(8, pixelSize / 120);
        const distanceScore = 1e3 / (dist + 1);
        const forwardScore = forwardness * 550;
        const cacheBoost = this.chunkMeshCache.has(c.id) ? 420 : 0;
        const warmupBoost = this.chunkWarmupActive && this.chunkLoadedCount < this.initialChunkLoadTarget ? centrality > 0.65 ? 1500 : centrality > 0.45 ? 500 : 0 : 0;
        const movingPriorityBoost = this.isCameraMoving ? centrality > 0.65 || forwardness > 0.7 ? 900 : centrality > 0.4 ? 250 : -250 : 0;
        if (this.isCameraMoving && centrality < 0.08 && pixelSize < 18) {
          return;
        }
        if (this.isCameraMoving && isPeripheralWhileMoving && !shouldRefreshPeripheral) {
          return;
        }
        if (!this.isCameraMoving && centerPriorityWindow && isPeripheralCandidate) {
          return;
        }
        c.priority = movingPriorityBoost + cacheBoost + warmupBoost + forwardScore + viewportBoost * 1e3 + sizeScore * 120 + distanceScore + centrality * 300;
        toLoad.push(c);
      }
    });
    if (!this.isCameraMoving && loadedChunks.length > this.maxLoadedChunks) {
      loadedChunks.sort((a, b) => b.center.distanceToSquared(cameraPos) - a.center.distanceToSquared(cameraPos));
      let unloadedCount = 0;
      const targetUnload = loadedChunks.length - this.maxLoadedChunks;
      for (const c of loadedChunks) {
        if (unloadedCount >= targetUnload) break;
        const lastTouchedAt = Math.max(c.lastVisibleAt || 0, c.lastFocusAt || 0);
        if (now - lastTouchedAt < this.chunkResidencyMs) continue;
        if (!c.mesh || !c.mesh.visible) {
          this.unloadChunk(c);
          unloadedCount++;
        }
      }
    }
    if (toLoad.length > 0 && performance.now() >= this.chunkLoadResumeAt) {
      toLoad.sort((a, b) => b.priority - a.priority);
      const available = this.maxConcurrentChunkLoads - this.processingChunks.size;
      const warmupExtra = this.chunkWarmupActive && this.chunkLoadedCount < this.initialChunkLoadTarget ? this.warmupChunkBoost : 0;
      const movingBudget = Math.max(
        profile.movingLoadBudgetMin,
        Math.min(profile.movingLoadBudgetMax, Math.floor(this.maxChunkLoadsPerFrame / 4))
      );
      const recoveryBudget = Math.max(
        profile.recoveryLoadBudgetMin,
        Math.min(
          profile.recoveryLoadBudgetMax,
          Math.floor(this.maxChunkLoadsPerFrame * profile.recoveryLoadBudgetRatio)
        )
      );
      const frameBudget = this.isCameraMoving ? movingBudget : this.isInPostMoveRecovery(now) ? recoveryBudget + warmupExtra : this.maxChunkLoadsPerFrame + warmupExtra;
      const count = Math.min(available, frameBudget, toLoad.length);
      for (let i = 0; i < count; i++) {
        this.loadChunk(toLoad[i]);
      }
    }
    if (this.chunkWarmupActive && this.chunkLoadedCount >= this.initialChunkLoadTarget) {
      this.chunkWarmupActive = false;
    }
  }
  async runWorkerTask(data, transferables) {
    return new Promise((resolve, reject) => {
      this.workerQueue.push({ resolve, reject, data, transferables });
      this.processWorkerQueue();
    });
  }
  processWorkerQueue() {
    if (this.activeWorkerCount >= this.maxWorkers || this.workerQueue.length === 0) return;
    const task = this.workerQueue.shift();
    this.activeWorkerCount++;
    let worker = this.workers.pop();
    if (!worker) {
      worker = new Worker(new URL(/* @vite-ignore */ ""+new URL('assets/chunkWorker-DAPcrn6M.js', import.meta.url).href+"", import.meta.url), { type: "module" });
    }
    const onMessage = (e) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      this.workers.push(worker);
      this.activeWorkerCount--;
      if (e.data.type === "success") {
        task.resolve(e.data.result);
      } else {
        task.reject(new Error(e.data.error));
      }
      this.processWorkerQueue();
    };
    const onError = (e) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      this.activeWorkerCount--;
      task.reject(new Error(e.message));
      this.processWorkerQueue();
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(task.data, task.transferables);
  }
  unloadChunk(chunk) {
    if (!chunk.loaded || !chunk.mesh) return;
    const bm = chunk.mesh;
    this.unregisterOptimizedMeshMapping(bm);
    if (bm.parent) bm.parent.remove(bm);
    this.cacheChunkMesh(chunk, bm);
    this.ensureChunkGhost(chunk);
    chunk.mesh = null;
    chunk.loaded = false;
    this.chunkLoadedCount = Math.max(0, this.chunkLoadedCount - 1);
    this.interactableListValid = false;
    this._needsBoundsUpdate = true;
    this.cullingDirty = true;
  }
  async loadChunk(chunk) {
    this.processingChunks.add(chunk.id);
    try {
      let bm = null;
      let loadedNow = false;
      const cachedMesh = this.takeCachedChunkMesh(chunk.id);
      if (cachedMesh) {
        bm = cachedMesh;
      } else if (chunk.node) {
        bm = await createBatchedMeshFromItemsAsync(chunk.node.items, this.sharedMaterial, {
          batchSize: 1200,
          yieldControl: () => this.yieldToMainThread()
        });
      } else if (chunk.nbimFileId && this.nbimFiles.has(chunk.nbimFileId) && chunk.byteOffset) {
        const file = this.nbimFiles.get(chunk.nbimFileId);
        const buffer = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
        const meta = this.nbimMeta.get(chunk.nbimFileId);
        const version = meta?.version ?? 7;
        const workerResult = await this.runWorkerTask({
          buffer,
          version,
          originalUuid: chunk.originalUuid,
          bimIdTable: meta?.bimIdTable
        }, [buffer]);
        bm = this.reconstructBatchedMesh(workerResult, this.sharedMaterial);
      }
      if (bm) {
        if (this.cancelledChunkIds.has(chunk.id) || !this.chunks.some((c) => c.id === chunk.id)) {
          this.disposeChunkMesh(bm);
          return;
        }
        bm.name = chunk.id;
        bm.userData.chunkId = chunk.id;
        bm.userData.originalUuid = chunk.originalUuid;
        if (chunk.nbimFileId) {
          bm.position.sub(this.globalOffset);
          bm.updateMatrixWorld(true);
        }
        let optimizedGroup = this.contentGroup.getObjectByName(chunk.groupName);
        if (!optimizedGroup) {
          optimizedGroup = new THREE.Group();
          optimizedGroup.name = chunk.groupName;
          optimizedGroup.userData.isOptimizedGroup = true;
          optimizedGroup.userData.originalUuid = chunk.originalUuid;
          this.contentGroup.add(optimizedGroup);
        }
        optimizedGroup.add(bm);
        chunk.mesh = bm;
        loadedNow = true;
        this.interactableListValid = false;
        this._needsBoundsUpdate = true;
        this.registerOptimizedMeshMapping(bm);
      }
      if (loadedNow && !chunk.loaded) {
        chunk.loaded = true;
        this.chunkLoadedCount++;
        chunk.lastVisibleAt = performance.now();
        chunk.lastFocusAt = chunk.lastVisibleAt;
        if (this.chunkWarmupActive && this.chunkLoadedCount >= this.initialChunkLoadTarget) {
          this.chunkWarmupActive = false;
        }
        this.reportChunkProgress();
        this.cullingDirty = true;
      }
      this.cancelledChunkIds.delete(chunk.id);
      const ghost = this.ghostGroup.getObjectByName(`ghost_${chunk.id}`);
      if (ghost) {
        this.ghostGroup.remove(ghost);
        if (ghost.geometry) ghost.geometry.dispose();
      }
    } catch (err) {
      console.error(`加载分块 ${chunk.id} 失败:`, err);
    } finally {
      this.processingChunks.delete(chunk.id);
    }
  }
  setChunkLoadingEnabled(enabled) {
    this.chunkLoadingEnabled = enabled;
    this.cullingDirty = true;
    if (enabled) this.checkCullingAndLoad();
  }
  setContentVisible(visible) {
    this.contentGroup.visible = visible;
    this.ghostGroup.visible = visible;
    this.renderer.render(this.scene, this.camera);
  }
  buildSceneGraph(object) {
    const node = {
      id: object.uuid,
      name: object.name || `Object_${object.id}`,
      type: object.isMesh ? "Mesh" : "Group",
      children: [],
      bimId: object.userData?.bimId ? String(object.userData.bimId) : object.userData?.expressID !== void 0 ? String(object.userData.expressID) : void 0,
      userData: { ...object.userData }
    };
    if (!this.nodeMap.has(object.uuid)) this.nodeMap.set(object.uuid, []);
    this.nodeMap.get(object.uuid).push(node);
    for (const child of object.children) {
      node.children.push(this.buildSceneGraph(child));
    }
    return node;
  }
  /**
   * 构建基于 IFC 图层和空间结构的复合树
   */
  /**
   * 构建基于 IFC 图层和空间结构的复合树
   */
  buildIFCStructure(object) {
    const buildSpatialRecursive = (obj) => {
      const node = {
        id: obj.uuid,
        name: obj.name || `Object_${obj.id}`,
        type: obj.isMesh ? "Mesh" : "Group",
        children: [],
        bimId: obj.userData?.expressID !== void 0 ? String(obj.userData.expressID) : void 0,
        userData: { ...obj.userData }
      };
      if (!this.nodeMap.has(obj.uuid)) this.nodeMap.set(obj.uuid, []);
      this.nodeMap.get(obj.uuid).push(node);
      for (const child of obj.children) {
        node.children.push(buildSpatialRecursive(child));
      }
      return node;
    };
    const spatialRoot = buildSpatialRecursive(object);
    const layerMap = object.userData.layerMap;
    if (layerMap && layerMap.size > 0) {
      const layerRoot = {
        id: `layers_${object.uuid}`,
        name: "图层结构 (Layers)",
        type: "Group",
        children: [],
        userData: { originalUuid: object.uuid }
      };
      if (!this.nodeMap.has(layerRoot.id)) this.nodeMap.set(layerRoot.id, []);
      this.nodeMap.get(layerRoot.id).push(layerRoot);
      const layers = /* @__PURE__ */ new Map();
      object.traverse((child) => {
        if (child.isMesh && child.userData.expressID !== void 0) {
          const expressID = child.userData.expressID;
          const layerName = layerMap.get(expressID) || "未分类图层";
          if (!layers.has(layerName)) {
            const lNode = {
              id: `layer_${layerName}_${object.uuid}`,
              name: layerName,
              type: "Group",
              children: [],
              userData: { originalUuid: object.uuid }
            };
            layers.set(layerName, lNode);
            if (!this.nodeMap.has(lNode.id)) this.nodeMap.set(lNode.id, []);
            this.nodeMap.get(lNode.id).push(lNode);
          }
          const layerNode = layers.get(layerName);
          const node = {
            id: child.uuid,
            name: child.name,
            type: "Mesh",
            bimId: String(expressID),
            userData: { ...child.userData }
          };
          layerNode.children.push(node);
          if (!this.nodeMap.has(child.uuid)) this.nodeMap.set(child.uuid, []);
          this.nodeMap.get(child.uuid).push(node);
        }
      });
      layerRoot.children = Array.from(layers.values());
      if (layerRoot.children.length > 0) {
        const compositeRoot = {
          id: `composite_${object.uuid}`,
          name: object.name || "IFC Model",
          type: "Group",
          children: [spatialRoot, layerRoot],
          userData: { originalUuid: object.uuid }
        };
        if (!this.nodeMap.has(compositeRoot.id)) this.nodeMap.set(compositeRoot.id, []);
        this.nodeMap.get(compositeRoot.id).push(compositeRoot);
        return compositeRoot;
      }
    }
    return spatialRoot;
  }
  async prepareObjectRuntimeData(object, maxAnisotropy, batchSize = 6e3) {
    const stack = [object];
    let traverseIndex = 0;
    while (stack.length > 0) {
      const child = stack.pop();
      if (child.isMesh) {
        const mesh = child;
        this.componentMap.set(mesh.uuid, mesh);
        if (mesh.userData.expressID !== void 0) {
          this.componentMap.set(mesh.userData.expressID, mesh);
        }
        if (!mesh.userData.bimId) {
          if (mesh.userData.expressID !== void 0) mesh.userData.bimId = String(mesh.userData.expressID);
          else mesh.userData.bimId = mesh.uuid;
        }
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((mat) => {
            if (mat.map) {
              mat.map.anisotropy = maxAnisotropy;
            }
          });
        }
      }
      traverseIndex++;
      for (let i = child.children.length - 1; i >= 0; i--) {
        stack.push(child.children[i]);
      }
      if (traverseIndex > 0 && traverseIndex % batchSize === 0) {
        await this.yieldToMainThread();
      }
    }
  }
  applyGlobalOffsetForModel(object) {
    const modelBox = new THREE.Box3().setFromObject(object);
    if (modelBox.isEmpty()) return modelBox;
    if (this.globalOffset.length() === 0) {
      modelBox.getCenter(this.globalOffset);
      console.log("初始化全局偏移以解决大坐标问题:", this.globalOffset);
    }
    object.position.sub(this.globalOffset);
    object.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(object);
  }
  configureModelWarmup(meshCount) {
    this.chunkWarmupActive = true;
    this.initialChunkLoadTarget = meshCount > 1e5 ? 24 : meshCount > 3e4 ? 18 : 12;
  }
  prepareStructureStage(object, meshCount, onProgress) {
    const shouldDeferStructure = meshCount >= this.deferredStructureThreshold;
    let deferredPlaceholderId = null;
    if (onProgress) {
      onProgress(5, shouldDeferStructure ? "正在准备轻量预览..." : "正在构建场景树...");
    }
    if (shouldDeferStructure) {
      deferredPlaceholderId = `deferred_${object.uuid}`;
      const placeholder = {
        id: deferredPlaceholderId,
        name: `${object.name || "Model"} (${meshCount} meshes)`,
        type: "Group",
        children: [],
        userData: {
          originalUuid: object.uuid,
          deferred: true,
          meshCount
        }
      };
      this.attachStructureRoot(placeholder);
      if (this.onStructureUpdate) this.onStructureUpdate();
    } else {
      const modelRoot = this.buildAndRegisterModelStructure(object);
      this.attachStructureRoot(modelRoot);
    }
    return { shouldDeferStructure, deferredPlaceholderId };
  }
  prepareModelBoundsStage(object, modelBox) {
    if (!modelBox.isEmpty()) {
      this.precomputedBounds.union(modelBox);
      this.sceneBounds.copy(this.precomputedBounds);
    }
    return !modelBox.isEmpty() ? this.createPreviewGhost(modelBox.clone(), `preview_${object.uuid}`) : null;
  }
  async prepareModelRuntimeStage(object, meshCount) {
    const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const shouldDeferRuntimeData = meshCount > 3e4;
    if (shouldDeferRuntimeData) {
      void this.prepareObjectRuntimeData(object, maxAnisotropy, 8e3);
    } else {
      await this.prepareObjectRuntimeData(object, maxAnisotropy, 6e3);
    }
  }
  attachModelToContentGroup(object) {
    const fileGroup = new THREE.Group();
    fileGroup.name = `file_${object.uuid}`;
    fileGroup.userData.originalUuid = object.uuid;
    object.userData.originalUuid = object.uuid;
    fileGroup.add(object);
    object.visible = false;
    this.contentGroup.add(fileGroup);
    this.interactableListValid = false;
  }
  async prepareModelChunkStage(object, meshCount, onProgress) {
    if (onProgress) onProgress(10, "正在收集构件...");
    const items = meshCount >= this.octreeWorkerThreshold ? await collectItemsBatched(object, {
      batchSize: 3e3,
      onProgress: (processed, total) => {
        if (!onProgress || total === 0) return;
        const ratio = processed / total;
        onProgress(10 + Math.round(ratio * 10), `正在收集构件... (${processed}/${total})`);
      }
    }) : collectItems(object);
    if (items.length === 0) return;
    if (onProgress) onProgress(20, `已收集 ${items.length} 个构件，正在计算八叉树...`);
    const bounds = await this.computeItemBoundsProgressively(items, onProgress);
    if (onProgress) onProgress(35, "正在计算八叉树...");
    const maxItemsPerNode = 3e3;
    const maxDepth = 6;
    const leafNodes = await this.buildLeafPlans(items, bounds, maxItemsPerNode, maxDepth);
    const ghostSpecs = await this.registerLeafChunksProgressively(object, leafNodes, onProgress);
    this.reportChunkProgress();
    this.checkCullingAndLoad();
    void this.createChunkGhostsProgressively(ghostSpecs);
    const meshesToHide = [];
    object.traverse((child) => {
      if (child.isMesh) {
        meshesToHide.push(child);
      }
    });
    for (let i = 0; i < meshesToHide.length; i++) {
      const child = meshesToHide[i];
      child.visible = false;
      child.userData.isOptimized = true;
      if (i > 0 && i % 6e3 === 0) {
        await this.yieldToMainThread();
      }
    }
    if (onProgress) onProgress(95, "分块准备完成");
  }
  finalizeModelStage(previewGhost, onProgress) {
    this.sceneBounds = this.computeTotalBounds(false);
    this.precomputedBounds = this.sceneBounds.clone();
    if (this.globalOffset.length() > 0) {
      this.precomputedBounds.translate(this.globalOffset);
    }
    this.updateSettings(this.settings);
    if (onProgress) onProgress(100, "模型已加入加载队列");
    this.checkCullingAndLoad();
    if (!previewGhost) return;
    this.ghostGroup.remove(previewGhost);
    if (previewGhost.geometry) previewGhost.geometry.dispose();
    if (previewGhost.material) {
      const materials = Array.isArray(previewGhost.material) ? previewGhost.material : [previewGhost.material];
      materials.forEach((m) => m.dispose && m.dispose());
    }
  }
  scheduleDeferredStructureReplacement(object, shouldDeferStructure, deferredPlaceholderId) {
    if (shouldDeferStructure && deferredPlaceholderId) {
      setTimeout(() => {
        try {
          const modelRoot = this.buildAndRegisterModelStructure(object);
          this.replaceStructureNode(deferredPlaceholderId, modelRoot);
          if (this.onStructureUpdate) this.onStructureUpdate();
        } catch (error) {
          console.warn("延迟构建结构树失败:", error);
        }
      }, 0);
      return;
    }
    if (this.onStructureUpdate) {
      this.onStructureUpdate();
    }
  }
  async addModel(object, onProgress) {
    object.updateMatrixWorld(true);
    const modelBox = this.applyGlobalOffsetForModel(object);
    const objectOverview = this.collectObjectOverview(object);
    const meshCount = objectOverview.meshes;
    this.configureModelWarmup(meshCount);
    this.registerOriginalStats(object.uuid, objectOverview);
    const { shouldDeferStructure, deferredPlaceholderId } = this.prepareStructureStage(object, meshCount, onProgress);
    const previewGhost = this.prepareModelBoundsStage(object, modelBox);
    await this.prepareModelRuntimeStage(object, meshCount);
    this.attachModelToContentGroup(object);
    await this.prepareModelChunkStage(object, meshCount, onProgress);
    this.finalizeModelStage(previewGhost, onProgress);
    this.scheduleDeferredStructureReplacement(object, shouldDeferStructure, deferredPlaceholderId);
  }
  removeObject(uuid) {
    const nodes = this.nodeMap.get(uuid);
    const originalUuid = nodes?.[0]?.userData?.originalUuid || uuid;
    const optimizedGroupsToRemove = [];
    this.contentGroup.traverse((child) => {
      const isMatch = child.name === `optimized_${uuid}` || child.name === `file_${uuid}` || child.userData.originalUuid === uuid || child.userData.originalUuid === originalUuid || child.name.startsWith("optimized_") && (child.userData.originalUuid === uuid || child.userData.originalUuid === originalUuid) || child.name.startsWith("file_") && (child.userData.originalUuid === uuid || child.userData.originalUuid === originalUuid);
      if (isMatch) {
        optimizedGroupsToRemove.push(child);
      }
    });
    optimizedGroupsToRemove.forEach((group) => {
      group.traverse((child) => {
        if (child.isBatchedMesh) {
          const bm = child;
          this.disposeChunkMesh(bm);
        }
      });
      group.removeFromParent();
    });
    const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
    const processRemoval = (o) => {
      const id = o instanceof THREE.Object3D ? o.uuid : o.id;
      const mappings = this.optimizedMapping.get(id);
      if (mappings) {
        mappings.forEach((m) => {
          m.mesh.setVisibleAt(m.instanceId, false);
        });
        this.optimizedMapping.delete(id);
      }
      if (o.isMesh) {
        const mesh = o;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          materials.forEach((m) => m.dispose());
        }
      } else if (o.isBatchedMesh) {
        const bm = o;
        this.disposeChunkMesh(bm);
      }
      this.componentMap.delete(id);
      if (o instanceof THREE.Object3D && o.userData.expressID !== void 0) {
        this.componentMap.delete(o.userData.expressID);
      }
      const nodeInfos = this.nodeMap.get(id);
      if (nodeInfos) {
        nodeInfos.forEach((nodeInfo) => {
          if (nodeInfo.bimId !== void 0) {
            this.componentMap.delete(nodeInfo.bimId);
          }
        });
      }
      this.nodeMap.delete(id);
    };
    if (obj) {
      obj.traverse(processRemoval);
      obj.removeFromParent();
    } else if (nodes && nodes.length > 0) {
      const traverseNode = (n) => {
        processRemoval(n);
        if (n.children) n.children.forEach(traverseNode);
      };
      traverseNode(nodes[0]);
    }
    this.interactableListValid = false;
    this.unregisterOriginalStats(originalUuid);
    this.clearChunkCache((chunkId, mesh) => {
      const owner = mesh.userData.originalUuid || "";
      return owner === uuid || owner === originalUuid || chunkId.startsWith(uuid) || chunkId.startsWith(originalUuid);
    });
    if (this.currentMeasureModelUuid === uuid || this.currentMeasureModelUuid === originalUuid) {
      this.currentMeasureModelUuid = null;
    }
    this.chunks = this.chunks.filter((c) => {
      const isMatch = c.originalUuid === uuid || c.originalUuid === originalUuid || c.id.startsWith(uuid);
      if (isMatch) {
        this.cancelledChunkIds.add(c.id);
        this.processingChunks.delete(c.id);
        const ghost = this.ghostGroup.getObjectByName(`ghost_${c.id}`);
        if (ghost) {
          this.ghostGroup.remove(ghost);
          if (ghost.geometry) ghost.geometry.dispose();
        }
        return false;
      }
      return true;
    });
    if (this.structureRoot) {
      const filterNodes = (nodes2) => {
        return nodes2.filter((n) => {
          if (n.id === uuid) return false;
          if (!this.nodeMap.has(n.id) && n.id !== "root") return false;
          if (n.children) {
            n.children = filterNodes(n.children);
          }
          return true;
        });
      };
      if (this.structureRoot.id === uuid) {
        this.structureRoot = { id: "root", name: "Root", type: "Group", children: [] };
      } else if (this.structureRoot.children) {
        this.structureRoot.children = filterNodes(this.structureRoot.children);
      }
    }
    this.precomputedBounds = this.computeTotalBounds();
    if (this.precomputedBounds.isEmpty()) {
      this.contentGroup.traverse((child) => {
        if (child.isMesh && child.visible) {
          const box = new THREE.Box3().setFromObject(child);
          if (!box.isEmpty()) this.precomputedBounds.union(box);
        }
      });
    }
    this.updateSceneBounds();
    if (this.onStructureUpdate) this.onStructureUpdate();
    this.measureRecords.forEach((record, recordId) => {
      let isRelated = record.modelUuid === uuid || record.modelUuid === originalUuid;
      if (!isRelated && record.modelUuid && obj) {
        obj.traverse((child) => {
          if (child.uuid === record.modelUuid) {
            isRelated = true;
          }
        });
      }
      if (isRelated) {
        this.removeMeasurement(recordId);
      }
    });
    return true;
  }
  async removeModel(uuid) {
    return this.removeObject(uuid);
  }
  addTileset(url, onProgress) {
    if (this.tilesRenderer) {
      this.tilesRenderer.dispose();
      this.contentGroup.remove(this.tilesRenderer.group);
    }
    if (onProgress) onProgress(10, "正在初始化 TilesRenderer...");
    const renderer = new TilesRenderer(url);
    renderer.setCamera(this.camera);
    renderer.setResolutionFromRenderer(this.camera, this.renderer);
    renderer.errorTarget = 16;
    renderer.lruCache.maxSize = 500 * 1024 * 1024;
    renderer.group.name = "3D Tileset";
    let loadedTiles = 0;
    let hasError = false;
    renderer.onLoadTileSet = () => {
      if (onProgress) onProgress(50, "Tileset 结构已加载");
    };
    renderer.onLoadModel = () => {
      loadedTiles++;
      if (onProgress && !hasError) {
        onProgress(Math.min(99, 50 + loadedTiles), `已加载瓦片: ${loadedTiles}`);
      }
    };
    setTimeout(() => {
      if (!renderer.tileset && !hasError) {
        hasError = true;
        if (onProgress) onProgress(0, "加载失败: 无法获取 Tileset 配置文件，请检查网络或路径。");
      }
    }, 1e4);
    renderer.onLoadTile = (_tile) => {
      if (this.onTilesUpdate) this.onTilesUpdate();
    };
    renderer.onDisposeTile = (_tile) => {
      if (this.onTilesUpdate) this.onTilesUpdate();
    };
    this.contentGroup.add(renderer.group);
    this.tilesRenderer = renderer;
    renderer.group.position.copy(this.globalOffset.clone().negate());
    renderer.group.name = "3D Tileset";
    const buildTilesTree = (tile, depth = 0) => {
      const node = {
        id: tile.content?.uuid || THREE.MathUtils.generateUUID(),
        name: tile.content?.name || `Tile_${tile.level}_${tile.x || 0}_${tile.y || 0}`,
        type: "Group",
        children: []
      };
      if (tile.children) {
        node.children = tile.children.map((c) => buildTilesTree(c, depth + 1));
      }
      return node;
    };
    const tilesNode = {
      id: renderer.group.uuid,
      name: "3D Tileset",
      type: "Group",
      children: renderer.tileset ? [buildTilesTree(renderer.tileset.root)] : []
    };
    if (!this.structureRoot.children) this.structureRoot.children = [];
    this.structureRoot.children.push(tilesNode);
    this.nodeMap.set(tilesNode.id, [tilesNode]);
    this.updateSceneBounds();
    this.updateSettings(this.settings);
    return renderer.group;
  }
  // --- 辅助功能 (对齐 refs) ---
  getTypeIndex(type) {
    const types = ["Generic", "Column", "Beam", "Slab", "Wall", "Window", "Door", "Pipe", "Duct"];
    const idx = types.indexOf(type);
    return idx === -1 ? 0 : idx;
  }
  guessType(name) {
    const n = name.toLowerCase();
    if (n.includes("col") || n.includes("柱")) return "Column";
    if (n.includes("beam") || n.includes("梁")) return "Beam";
    if (n.includes("slab") || n.includes("板")) return "Slab";
    if (n.includes("wall") || n.includes("墙")) return "Wall";
    if (n.includes("window") || n.includes("窗")) return "Window";
    if (n.includes("door") || n.includes("门")) return "Door";
    return "Generic";
  }
  // --- NBIM 导入/导出功能 ---
  generateChunkBinaryV8(items, bimIdToIndex) {
    const uniqueGeos = [];
    const geoMap = /* @__PURE__ */ new Map();
    items.forEach((item) => {
      if (item.geometry && !geoMap.has(item.geometry)) {
        geoMap.set(item.geometry, uniqueGeos.length);
        uniqueGeos.push(item.geometry);
      }
    });
    let size = 4;
    for (const geo of uniqueGeos) {
      const vertCount = geo.attributes.position.count;
      const index = geo.index;
      const indexCount = index ? index.count : 0;
      size += 4 + 4 + vertCount * 12 + vertCount * 12;
      if (indexCount > 0) size += indexCount * 4;
    }
    size += 4;
    size += items.length * (4 + 4 + 4 + 64 + 4);
    const buffer = new ArrayBuffer(size);
    const dv = new DataView(buffer);
    let offset = 0;
    dv.setUint32(offset, uniqueGeos.length, true);
    offset += 4;
    for (const geo of uniqueGeos) {
      const pos = geo.getAttribute("position");
      const norm = geo.getAttribute("normal");
      const count = pos.count;
      const index = geo.index;
      const indexCount = index ? index.count : 0;
      dv.setUint32(offset, count, true);
      offset += 4;
      dv.setUint32(offset, indexCount, true);
      offset += 4;
      for (let i = 0; i < count; i++) {
        dv.setFloat32(offset, pos.getX(i), true);
        offset += 4;
        dv.setFloat32(offset, pos.getY(i), true);
        offset += 4;
        dv.setFloat32(offset, pos.getZ(i), true);
        offset += 4;
      }
      for (let i = 0; i < count; i++) {
        dv.setFloat32(offset, norm.getX(i), true);
        offset += 4;
        dv.setFloat32(offset, norm.getY(i), true);
        offset += 4;
        dv.setFloat32(offset, norm.getZ(i), true);
        offset += 4;
      }
      if (index && indexCount > 0) {
        for (let i = 0; i < indexCount; i++) {
          dv.setUint32(offset, index.getX(i), true);
          offset += 4;
        }
      }
    }
    dv.setUint32(offset, items.length, true);
    offset += 4;
    for (const item of items) {
      const treeNodes = this.nodeMap.get(item.uuid);
      const firstNode = treeNodes?.[0];
      const bimId = item.bimId || firstNode?.bimId || firstNode?.id || item.uuid;
      const bimIdIndex = bimIdToIndex.get(bimId) ?? 0;
      const typeStr = this.guessType(firstNode?.name || "");
      dv.setUint32(offset, bimIdIndex, true);
      offset += 4;
      const typeIndex = typeof item.typeIndex === "number" ? item.typeIndex : this.getTypeIndex(typeStr);
      dv.setUint32(offset, typeIndex, true);
      offset += 4;
      dv.setUint32(offset, item.color, true);
      offset += 4;
      const elements = item.matrix.elements;
      for (let k = 0; k < 16; k++) {
        dv.setFloat32(offset, elements[k], true);
        offset += 4;
      }
      const geoId = geoMap.get(item.geometry) || 0;
      dv.setUint32(offset, geoId, true);
      offset += 4;
    }
    return buffer;
  }
  reconstructBatchedMesh(data, material) {
    const { geometries: geoData, instances: instData, originalUuid } = data;
    const hasAnyIndex = geoData.some((g) => g.index && g.index.length > 0);
    const geometries = geoData.map((g) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(g.position, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(g.normal, 3));
      if (g.index && g.index.length > 0) {
        geo.setIndex(new THREE.BufferAttribute(g.index, 1));
      } else if (hasAnyIndex) {
        const count = g.position.length / 3;
        const index = new Uint32Array(count);
        for (let i = 0; i < count; i++) index[i] = i;
        geo.setIndex(new THREE.BufferAttribute(index, 1));
      }
      return geo;
    });
    let totalVerts = 0;
    let totalIndices = 0;
    geometries.forEach((g) => {
      totalVerts += g.attributes.position.count;
      if (g.index) totalIndices += g.index.count;
    });
    const bm = new THREE.BatchedMesh(instData.length, totalVerts, totalIndices, material);
    bm.frustumCulled = false;
    bm.perInstanceFrustumCulling = false;
    const geoIds = geometries.map((g) => bm.addGeometry(g));
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const batchIdToUuid = /* @__PURE__ */ new Map();
    const batchIdToBimId = /* @__PURE__ */ new Map();
    const batchIdToColor = /* @__PURE__ */ new Map();
    const batchIdToGeometry = /* @__PURE__ */ new Map();
    instData.forEach((inst) => {
      color.setHex(inst.color);
      matrix.fromArray(inst.matrix);
      const instId = bm.addInstance(geoIds[inst.geoIdx]);
      bm.setMatrixAt(instId, matrix);
      bm.setColorAt(instId, color);
      const geo = geometries[inst.geoIdx];
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (geo.boundingBox && bm.setBoundingBoxAt) bm.setBoundingBoxAt(instId, geo.boundingBox);
      const bimId = inst.bimId;
      const key = `${originalUuid}::${bimId}`;
      const nodeIds = this.bimIdToNodeIds.get(key);
      batchIdToUuid.set(instId, nodeIds?.[0] || `bim_${bimId}`);
      batchIdToBimId.set(instId, bimId);
      batchIdToColor.set(instId, inst.color);
      batchIdToGeometry.set(instId, geometries[inst.geoIdx]);
    });
    bm.userData.batchIdToUuid = batchIdToUuid;
    bm.userData.batchIdToBimId = batchIdToBimId;
    bm.userData.batchIdToColor = batchIdToColor;
    bm.userData.batchIdToGeometry = batchIdToGeometry;
    bm.computeBoundingBox();
    bm.computeBoundingSphere();
    return bm;
  }
  async exportNbim() {
    if (this.chunks.length === 0) throw new Error("无模型数据可导出");
    const bimIdTable = [""];
    const bimIdToIndex = /* @__PURE__ */ new Map();
    const addBimId = (bimId) => {
      if (!bimId) return;
      if (bimIdToIndex.has(bimId)) return;
      const idx = bimIdTable.length;
      bimIdTable.push(bimId);
      bimIdToIndex.set(bimId, idx);
    };
    const traverseBimIds = (node) => {
      addBimId(node.bimId);
      if (node.children) node.children.forEach(traverseBimIds);
    };
    traverseBimIds(this.structureRoot);
    const ifcApiByModel = /* @__PURE__ */ new Map();
    this.contentGroup.traverse((obj) => {
      if (obj.userData?.ifcAPI && obj.userData?.modelID !== void 0 && obj.userData?.originalUuid) {
        ifcApiByModel.set(String(obj.userData.originalUuid), { ifcApi: obj.userData.ifcAPI, modelID: obj.userData.modelID });
      }
    });
    const bimProperties = {};
    const fillBimProperties = (node) => {
      const originalUuid = node.userData?.originalUuid ? String(node.userData.originalUuid) : "";
      if (node.bimId) {
        const key = `${originalUuid}::${node.bimId}`;
        if (!bimProperties[key]) {
          bimProperties[key] = { uuid: node.id, name: node.name };
          const expressID = node.userData?.expressID;
          if (expressID !== void 0 && ifcApiByModel.has(originalUuid)) {
            try {
              const { ifcApi, modelID } = ifcApiByModel.get(originalUuid);
              const entity = ifcApi.GetLine(modelID, Number(expressID));
              if (entity) {
                bimProperties[key].ifcType = entity.is_a || "";
                bimProperties[key].globalId = entity.GlobalId?.value || "";
                bimProperties[key].ifcName = entity.Name?.value || "";
              }
            } catch {
            }
          }
        }
      }
      if (node.children) node.children.forEach(fillBimProperties);
    };
    fillBimProperties(this.structureRoot);
    const chunkBlobs = [];
    const exportChunks = this.chunks.map((c) => ({
      id: c.id,
      bounds: {
        min: { x: c.bounds.min.x, y: c.bounds.min.y, z: c.bounds.min.z },
        max: { x: c.bounds.max.x, y: c.bounds.max.y, z: c.bounds.max.z }
      },
      byteOffset: 0,
      byteLength: 0
    }));
    let currentOffset = 1024;
    const decodeV7 = (buffer) => {
      const dv2 = new DataView(buffer);
      let offset = 0;
      const geoCount = dv2.getUint32(offset, true);
      offset += 4;
      const geometries = [];
      for (let i = 0; i < geoCount; i++) {
        const vertCount = dv2.getUint32(offset, true);
        offset += 4;
        const indexCount = dv2.getUint32(offset, true);
        offset += 4;
        const posArr = new Float32Array(buffer, offset, vertCount * 3);
        offset += vertCount * 12;
        const normArr = new Float32Array(buffer, offset, vertCount * 3);
        offset += vertCount * 12;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posArr), 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normArr), 3));
        if (indexCount > 0) {
          const indexArr = new Uint32Array(buffer, offset, indexCount);
          offset += indexCount * 4;
          geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArr), 1));
        }
        geometries.push(geo);
      }
      const instanceCount = dv2.getUint32(offset, true);
      offset += 4;
      const matrix = new THREE.Matrix4();
      const instances = [];
      for (let i = 0; i < instanceCount; i++) {
        const bimIdNum = dv2.getUint32(offset, true);
        offset += 4;
        const typeIndex = dv2.getUint32(offset, true);
        offset += 4;
        const color = dv2.getUint32(offset, true);
        offset += 4;
        for (let k = 0; k < 16; k++) {
          matrix.elements[k] = dv2.getFloat32(offset, true);
          offset += 4;
        }
        const geoIdx = dv2.getUint32(offset, true);
        offset += 4;
        instances.push({ bimId: String(bimIdNum), typeIndex, color, matrix: matrix.clone(), geometry: geometries[geoIdx] });
      }
      return instances;
    };
    const decodeV8 = (buffer, table) => {
      const dv2 = new DataView(buffer);
      let offset = 0;
      const geoCount = dv2.getUint32(offset, true);
      offset += 4;
      const geometries = [];
      for (let i = 0; i < geoCount; i++) {
        const vertCount = dv2.getUint32(offset, true);
        offset += 4;
        const indexCount = dv2.getUint32(offset, true);
        offset += 4;
        const posArr = new Float32Array(buffer, offset, vertCount * 3);
        offset += vertCount * 12;
        const normArr = new Float32Array(buffer, offset, vertCount * 3);
        offset += vertCount * 12;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(posArr), 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normArr), 3));
        if (indexCount > 0) {
          const indexArr = new Uint32Array(buffer, offset, indexCount);
          offset += indexCount * 4;
          geo.setIndex(new THREE.BufferAttribute(new Uint32Array(indexArr), 1));
        }
        geometries.push(geo);
      }
      const instanceCount = dv2.getUint32(offset, true);
      offset += 4;
      const matrix = new THREE.Matrix4();
      const instances = [];
      for (let i = 0; i < instanceCount; i++) {
        const bimIdIndex = dv2.getUint32(offset, true);
        offset += 4;
        const typeIndex = dv2.getUint32(offset, true);
        offset += 4;
        const color = dv2.getUint32(offset, true);
        offset += 4;
        for (let k = 0; k < 16; k++) {
          matrix.elements[k] = dv2.getFloat32(offset, true);
          offset += 4;
        }
        const geoIdx = dv2.getUint32(offset, true);
        offset += 4;
        instances.push({ bimId: table[bimIdIndex] ?? String(bimIdIndex), typeIndex, color, matrix: matrix.clone(), geometry: geometries[geoIdx] });
      }
      return instances;
    };
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const exportChunk = exportChunks[i];
      let buffer;
      if (chunk.node) {
        buffer = this.generateChunkBinaryV8(chunk.node.items, bimIdToIndex);
      } else if (chunk.nbimFileId && this.nbimFiles.has(chunk.nbimFileId) && chunk.byteOffset) {
        const file = this.nbimFiles.get(chunk.nbimFileId);
        const raw = await file.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength).arrayBuffer();
        const meta = this.nbimMeta.get(chunk.nbimFileId);
        const version = meta?.version ?? 7;
        const instances = version >= 8 ? decodeV8(raw, meta?.bimIdTable || []) : decodeV7(raw);
        const items = instances.map((inst) => ({ uuid: "", bimId: inst.bimId, typeIndex: inst.typeIndex, color: inst.color, matrix: inst.matrix, geometry: inst.geometry }));
        buffer = this.generateChunkBinaryV8(items, bimIdToIndex);
      } else {
        continue;
      }
      const uint8 = new Uint8Array(buffer);
      chunkBlobs.push(uint8);
      exportChunk.byteOffset = currentOffset;
      exportChunk.byteLength = uint8.byteLength;
      currentOffset += uint8.byteLength;
    }
    const manifest = {
      globalBounds: {
        min: { x: this.sceneBounds.min.x, y: this.sceneBounds.min.y, z: this.sceneBounds.min.z },
        max: { x: this.sceneBounds.max.x, y: this.sceneBounds.max.y, z: this.sceneBounds.max.z }
      },
      chunks: exportChunks,
      stats: this.originalStats,
      structureTree: (() => {
        const sanitizeUserData = (ud) => {
          if (!ud || typeof ud !== "object") return void 0;
          const out = {};
          if (ud.originalUuid !== void 0) out.originalUuid = String(ud.originalUuid);
          if (ud.expressID !== void 0) out.expressID = ud.expressID;
          if (ud.modelID !== void 0) out.modelID = ud.modelID;
          return Object.keys(out).length > 0 ? out : void 0;
        };
        const srcRoot = this.structureRoot;
        const rootCopy = {
          id: srcRoot?.id,
          name: srcRoot?.name,
          type: srcRoot?.type,
          visible: srcRoot?.visible !== false,
          children: []
        };
        if (srcRoot?.bimId !== void 0) rootCopy.bimId = srcRoot.bimId;
        if (srcRoot?.chunkId !== void 0) rootCopy.chunkId = srcRoot.chunkId;
        const rootUd = sanitizeUserData(srcRoot?.userData);
        if (rootUd) rootCopy.userData = rootUd;
        const stack = [{ src: srcRoot, dst: rootCopy }];
        while (stack.length > 0) {
          const { src, dst } = stack.pop();
          const children = Array.isArray(src?.children) ? src.children : [];
          for (const child of children) {
            const childCopy = {
              id: child?.id,
              name: child?.name,
              type: child?.type,
              visible: child?.visible !== false,
              children: []
            };
            if (child?.bimId !== void 0) childCopy.bimId = child.bimId;
            if (child?.chunkId !== void 0) childCopy.chunkId = child.chunkId;
            const ud = sanitizeUserData(child?.userData);
            if (ud) childCopy.userData = ud;
            dst.children.push(childCopy);
            stack.push({ src: child, dst: childCopy });
          }
        }
        return rootCopy;
      })(),
      bimIdTable,
      bimProperties
    };
    let manifestStr;
    try {
      manifestStr = JSON.stringify(manifest);
    } catch (e) {
      const minimalManifest = {
        globalBounds: manifest.globalBounds,
        chunks: manifest.chunks,
        structureTree: { id: this.structureRoot.id, name: this.structureRoot.name, type: this.structureRoot.type, children: this.structureRoot.children ? [] : [] },
        bimIdTable: manifest.bimIdTable,
        bimProperties: {}
      };
      manifestStr = JSON.stringify(minimalManifest);
    }
    const manifestBytes = new TextEncoder().encode(manifestStr);
    const header = new ArrayBuffer(1024);
    const dv = new DataView(header);
    dv.setUint32(0, 1296646734, true);
    dv.setUint32(4, 8, true);
    dv.setUint32(8, currentOffset, true);
    dv.setUint32(12, manifestBytes.byteLength, true);
    const blobParts = [header, ...chunkBlobs, manifestBytes];
    const finalBlob = new Blob(blobParts, { type: "application/octet-stream" });
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `model_${(/* @__PURE__ */ new Date()).getTime()}.nbim`;
    a.click();
    URL.revokeObjectURL(url);
  }
  async loadNbim(file, onProgress) {
    const fileId = `nbim_${file.name}_${(/* @__PURE__ */ new Date()).getTime()}`;
    this.nbimFiles.set(fileId, file);
    if (onProgress) onProgress(10, "正在解析 NBIM 文件头...");
    const headerBuffer = await file.slice(0, 1024).arrayBuffer();
    const dv = new DataView(headerBuffer);
    const magic = dv.getUint32(0, true);
    if (magic !== 1296646734) throw new Error("不是有效的 NBIM 文件");
    const version = dv.getUint32(4, true);
    const manifestOffset = dv.getUint32(8, true);
    const manifestLen = dv.getUint32(12, true);
    if (onProgress) onProgress(20, "正在读取元数据...");
    const manifestBlob = file.slice(manifestOffset, manifestOffset + manifestLen);
    const manifestText = await manifestBlob.text();
    const manifest = JSON.parse(manifestText);
    this.nbimMeta.set(fileId, { version, bimIdTable: manifest.bimIdTable });
    if (manifest.globalBounds) {
      const newBounds = new THREE.Box3(
        new THREE.Vector3(manifest.globalBounds.min.x, manifest.globalBounds.min.y, manifest.globalBounds.min.z),
        new THREE.Vector3(manifest.globalBounds.max.x, manifest.globalBounds.max.y, manifest.globalBounds.max.z)
      );
      if (this.globalOffset.length() === 0) {
        newBounds.getCenter(this.globalOffset);
        console.log("初始化全局偏移 (NBIM):", this.globalOffset);
      }
      if (this.precomputedBounds.isEmpty()) {
        this.precomputedBounds.copy(newBounds);
      } else {
        this.precomputedBounds.union(newBounds);
      }
      this.sceneBounds.copy(this.precomputedBounds);
    }
    const modelRoot = manifest.structureTree;
    if (!this.structureRoot.children) this.structureRoot.children = [];
    if (modelRoot) {
      if (modelRoot.children && modelRoot.name === "Root") {
        this.structureRoot.children.push(...modelRoot.children);
      } else {
        this.structureRoot.children.push(modelRoot);
      }
    }
    const rootId = modelRoot?.id || fileId;
    this.nbimPropsByOriginalUuid.set(rootId, manifest.bimProperties || {});
    const quickStats = manifest.stats || {
      meshes: this.countStructureRenderableNodes(modelRoot),
      faces: 0,
      memory: parseFloat(((manifest.chunks || []).reduce((sum, chunk) => sum + (chunk.byteLength || 0), 0) / (1024 * 1024)).toFixed(2))
    };
    this.registerOriginalStats(rootId, quickStats);
    const fileGroup = new THREE.Group();
    fileGroup.name = `file_${rootId}`;
    fileGroup.userData.originalUuid = rootId;
    this.contentGroup.add(fileGroup);
    this.interactableListValid = false;
    if (modelRoot) {
      const traverse = (node) => {
        if (!node.userData) node.userData = {};
        node.userData.originalUuid = rootId;
        if (!this.nodeMap.has(node.id)) this.nodeMap.set(node.id, []);
        this.nodeMap.get(node.id).push(node);
        if (node.bimId) {
          const key = `${rootId}::${node.bimId}`;
          if (!this.bimIdToNodeIds.has(key)) this.bimIdToNodeIds.set(key, []);
          this.bimIdToNodeIds.get(key).push(node.id);
        }
        if (node.children) node.children.forEach(traverse);
      };
      traverse(modelRoot);
    }
    if (onProgress) onProgress(30, "正在初始化分块...");
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.LineBasicMaterial({ color: 4674921, transparent: true, opacity: 0.3 });
    manifest.chunks.forEach((c) => {
      const bounds = new THREE.Box3(
        new THREE.Vector3(c.bounds.min.x, c.bounds.min.y, c.bounds.min.z),
        new THREE.Vector3(c.bounds.max.x, c.bounds.max.y, c.bounds.max.z)
      );
      if (this.globalOffset.length() > 0) {
        bounds.translate(this.globalOffset.clone().negate());
      }
      const chunkId = c.id;
      const center = bounds.getCenter(new THREE.Vector3());
      const paddedBounds = bounds.clone();
      const padSize = bounds.getSize(new THREE.Vector3()).multiplyScalar(this.chunkPadding);
      paddedBounds.expandByVector(padSize);
      this.chunks.push({
        id: chunkId,
        bounds,
        paddedBounds,
        _padding: this.chunkPadding,
        center,
        loaded: false,
        byteOffset: c.byteOffset,
        byteLength: c.byteLength,
        nbimFileId: fileId,
        groupName: `optimized_${rootId}`,
        originalUuid: rootId
      });
      const size = new THREE.Vector3();
      bounds.getSize(size);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(boxGeo),
        boxMat
      );
      edges.name = `ghost_${chunkId}`;
      edges.scale.copy(size);
      edges.position.copy(center);
      this.ghostGroup.add(edges);
    });
    this.reportChunkProgress();
    this.fitView(true);
    this.chunkWarmupActive = true;
    this.initialChunkLoadTarget = this.chunks.length > 200 ? 24 : this.chunks.length > 80 ? 16 : 10;
    if (onProgress) onProgress(100, "NBIM 已就绪，正在按需加载...");
    this.checkCullingAndLoad();
    if (!manifest.stats && manifest.chunks?.length) {
      void this.estimateNbimStats(file, manifest.chunks, version).then((stats) => {
        this.unregisterOriginalStats(rootId);
        this.registerOriginalStats(rootId, stats);
      }).catch((error) => {
        console.warn("NBIM 统计估算失败:", error);
      });
    }
  }
  async clear() {
    console.log("开始清空场景...");
    try {
      const disposeObject = (obj) => {
        if (obj.isMesh) {
          const mesh = obj;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((m) => m.dispose());
          }
        } else if (obj.isBatchedMesh) {
          const bm = obj;
          if (bm.geometry) bm.geometry.dispose();
          if (bm.material) {
            const materials = Array.isArray(bm.material) ? bm.material : [bm.material];
            materials.forEach((m) => m.dispose());
          }
        }
      };
      this.contentGroup.traverse(disposeObject);
      while (this.contentGroup.children.length > 0) {
        this.contentGroup.remove(this.contentGroup.children[0]);
      }
      if (this.tilesRenderer) {
        this.tilesRenderer.dispose();
        this.tilesRenderer = null;
      }
      this.ghostGroup.children.forEach(disposeObject);
      this.ghostGroup.clear();
      this.selectionBox.visible = false;
      this.highlightMesh.visible = false;
      this.clearAllMeasurements();
      this.optimizedMapping.clear();
      this.sceneBounds.makeEmpty();
      this.precomputedBounds.makeEmpty();
      this.nbimFiles.clear();
      this.nbimMeta.clear();
      this.nbimPropsByOriginalUuid.clear();
      this.structureRoot = { id: "root", name: "Root", type: "Group", children: [] };
      this.nodeMap.clear();
      this.bimIdToNodeIds.clear();
      this.chunks = [];
      this.lastReportedProgress = { loaded: -1, total: -1 };
      this.processingChunks.clear();
      this.cancelledChunkIds.clear();
      this.chunkLoadedCount = 0;
      this.reportChunkProgress();
      this.componentMap.clear();
      this.clearChunkCache();
      this.originalStats = { meshes: 0, faces: 0, memory: 0 };
      this.originalStatsByModel.clear();
      this.chunkLoadingEnabled = true;
      this.contentGroup.visible = true;
      this.ghostGroup.visible = true;
      this.chunkWarmupActive = false;
      this.globalOffset.set(0, 0, 0);
      console.log("场景已清空");
    } catch (error) {
      console.error("清空场景失败:", error);
      throw error;
    }
  }
  getStructureNodes(id) {
    return this.nodeMap.get(id);
  }
  getNbimProperties(id) {
    const node = this.nodeMap.get(id)?.[0];
    if (!node || !node.bimId) return null;
    const originalUuid = node.userData?.originalUuid ? String(node.userData.originalUuid) : "";
    if (!originalUuid) return null;
    const map = this.nbimPropsByOriginalUuid.get(originalUuid);
    if (!map) return null;
    const key = `${originalUuid}::${node.bimId}`;
    return map[key] || null;
  }
  setAllVisibility(visible) {
    const setNodeVisible = (n) => {
      n.visible = visible;
      if (n.children) n.children.forEach(setNodeVisible);
    };
    if (this.structureRoot.children) this.structureRoot.children.forEach(setNodeVisible);
    this.optimizedMapping.forEach((mappings) => {
      mappings.forEach((m) => {
        m.mesh.setVisibleAt(m.instanceId, visible);
      });
    });
    this.contentGroup.traverse((o) => {
      if (o.name === "Helpers" || o.name === "Measure") return;
      if (o.isMesh && o.userData.isOptimized) {
        o.visible = false;
        return;
      }
      o.visible = visible;
    });
    this.updateSceneBounds();
  }
  hideObjects(uuids) {
    uuids.forEach((id) => this.setObjectVisibility(id, false));
  }
  isolateObjects(uuids) {
    this.setAllVisibility(false);
    const affectedBatchedMeshes = /* @__PURE__ */ new Set();
    uuids.forEach((uuid) => {
      this.setObjectVisibility(uuid, true);
      const nodes = this.nodeMap.get(uuid);
      if (nodes) {
        nodes.forEach((node) => {
          const showChildrenRecursive = (n) => {
            if (n.id !== uuid) {
              this.setObjectVisibility(n.id, true);
            }
            if (n.children) {
              n.children.forEach(showChildrenRecursive);
            }
          };
          showChildrenRecursive(node);
        });
      }
      const mappings = this.optimizedMapping.get(uuid);
      if (mappings) {
        mappings.forEach((m) => {
          affectedBatchedMeshes.add(m.mesh);
        });
      }
    });
    affectedBatchedMeshes.forEach((bm) => {
      bm.visible = true;
      let parent = bm.parent;
      while (parent && parent !== this.scene) {
        parent.visible = true;
        parent = parent.parent;
      }
    });
    uuids.forEach((uuid) => {
      const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
      if (obj) {
        let parent = obj.parent;
        while (parent && parent !== this.scene) {
          parent.visible = true;
          parent = parent.parent;
        }
      }
    });
    this.interactableListValid = false;
    this.updateSceneBounds();
  }
  setObjectVisibility(uuid, visible, showParents = true) {
    const nodes = this.nodeMap.get(uuid);
    if (nodes) {
      nodes.forEach((node) => {
        const setVisibleRecursive = (n) => {
          n.visible = visible;
          if (n.children) n.children.forEach(setVisibleRecursive);
          const otherNodes = this.nodeMap.get(n.id);
          if (otherNodes) {
            otherNodes.forEach((on) => on.visible = visible);
          }
        };
        setVisibleRecursive(node);
      });
    }
    const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
    if (visible && obj && showParents) {
      let parent = obj.parent;
      while (parent && parent !== this.scene) {
        parent.visible = true;
        parent = parent.parent;
      }
    }
    if (!visible) {
      const idsToUnhighlight = [];
      if (this.highlightedUuids.has(uuid)) {
        idsToUnhighlight.push(uuid);
      }
      if (obj) {
        obj.traverse((child) => {
          if (this.highlightedUuids.has(child.uuid)) {
            idsToUnhighlight.push(child.uuid);
          }
        });
      } else if (nodes && nodes.length > 0) {
        const findHighlightedRecursive = (n) => {
          if (this.highlightedUuids.has(n.id)) idsToUnhighlight.push(n.id);
          if (n.children) n.children.forEach(findHighlightedRecursive);
        };
        findHighlightedRecursive(nodes[0]);
      }
      if (idsToUnhighlight.length > 0) {
        const nextHighlighted = new Set(this.highlightedUuids);
        idsToUnhighlight.forEach((id) => nextHighlighted.delete(id));
        this.highlightObjects(Array.from(nextHighlighted));
      }
    }
    if (!obj) {
      if (nodes && nodes.length > 0) {
        const updateMappingsRecursive = (n) => {
          const mappings = this.optimizedMapping.get(n.id);
          if (mappings) {
            mappings.forEach((m) => {
              m.mesh.setVisibleAt(m.instanceId, visible);
            });
          }
          if (n.children) n.children.forEach(updateMappingsRecursive);
        };
        updateMappingsRecursive(nodes[0]);
      }
      return;
    }
    obj.traverse((o) => {
      if (o.name !== "Helpers" && o.name !== "Measure") {
        if (o.isMesh && o.userData.isOptimized) {
          o.visible = false;
        } else {
          o.visible = visible;
        }
        const mappings = this.optimizedMapping.get(o.uuid);
        if (mappings) {
          mappings.forEach((m) => {
            m.mesh.setVisibleAt(m.instanceId, visible);
          });
        }
      }
    });
    this.interactableListValid = false;
    this.updateSceneBounds();
  }
  highlightObject(uuid) {
    this.highlightObjects(uuid ? [uuid] : []);
  }
  highlightObjects(uuids) {
    const target = new Set(uuids.filter(Boolean));
    const restoreOne = (id) => {
      const mappings = this.optimizedMapping.get(id);
      if (mappings) {
        mappings.forEach((m) => {
          m.mesh.setColorAt(m.instanceId, new THREE.Color(m.originalColor));
          if (m.mesh.instanceColor) {
            m.mesh.instanceColor.needsUpdate = true;
          }
        });
      }
    };
    const applyOne = (id) => {
      const mappings = this.optimizedMapping.get(id);
      if (mappings) {
        mappings.forEach((m) => {
          m.mesh.setColorAt(m.instanceId, new THREE.Color(16755200));
          if (m.mesh.instanceColor) {
            m.mesh.instanceColor.needsUpdate = true;
          }
        });
      }
    };
    for (const prev of this.highlightedUuids) {
      if (!target.has(prev)) restoreOne(prev);
    }
    for (const next of target) {
      if (!this.highlightedUuids.has(next)) applyOne(next);
    }
    this.highlightedUuids = target;
    this.selectionBox.visible = false;
    this.highlightMesh.visible = false;
    this.lastSelectedUuid = uuids.length > 0 ? uuids[uuids.length - 1] : null;
    if (target.size === 0) return;
    const union = new THREE.Box3();
    const tmpBox = new THREE.Box3();
    const tmpMat = new THREE.Matrix4();
    const addObjectBounds = (id) => {
      const mappings = this.optimizedMapping.get(id);
      if (mappings && mappings.length > 0) {
        const m = mappings[0];
        if (m.geometry) {
          if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
          tmpBox.copy(m.geometry.boundingBox);
          m.mesh.getMatrixAt(m.instanceId, tmpMat);
          tmpMat.premultiply(m.mesh.matrixWorld);
          tmpBox.applyMatrix4(tmpMat);
          union.union(tmpBox);
        }
        return;
      }
      const obj = this.contentGroup.getObjectByProperty("uuid", id);
      if (!obj) return;
      obj.updateMatrixWorld(true);
      if (obj.userData.boundingBox) {
        tmpBox.copy(obj.userData.boundingBox).applyMatrix4(obj.matrixWorld);
      } else {
        tmpBox.setFromObject(obj);
      }
      union.union(tmpBox);
    };
    for (const id of target) addObjectBounds(id);
    if (!union.isEmpty()) {
      this.selectionBox.box.copy(union);
      this.selectionBox.visible = false;
    }
    const focusId = this.lastSelectedUuid;
    if (!focusId) return;
    const focusMappings = this.optimizedMapping.get(focusId);
    if (focusMappings && focusMappings.length > 0) {
      const m = focusMappings[0];
      if (m.geometry) {
        this.highlightMesh.geometry = m.geometry;
        const matrix = new THREE.Matrix4();
        m.mesh.getMatrixAt(m.instanceId, matrix);
        matrix.premultiply(m.mesh.matrixWorld);
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        matrix.decompose(worldPos, worldQuat, worldScale);
        this.highlightMesh.position.copy(worldPos);
        this.highlightMesh.quaternion.copy(worldQuat);
        this.highlightMesh.scale.copy(worldScale);
        this.highlightMesh.visible = true;
      }
      return;
    }
    const focusObj = this.contentGroup.getObjectByProperty("uuid", focusId);
    if (!focusObj) return;
    if (focusObj.isMesh) {
      focusObj.updateMatrixWorld(true);
      this.highlightMesh.geometry = focusObj.geometry;
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      focusObj.matrixWorld.decompose(worldPos, worldQuat, worldScale);
      this.highlightMesh.position.copy(worldPos);
      this.highlightMesh.quaternion.copy(worldQuat);
      this.highlightMesh.scale.copy(worldScale);
      this.highlightMesh.visible = true;
    }
  }
  pick(clientX, clientY) {
    const intersect = this.getRayIntersects(clientX, clientY);
    if (!intersect) return null;
    return { object: intersect.object, intersect };
  }
  getRayIntersects(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = (clientX - rect.left) / rect.width * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    if (!this.interactableListValid) {
      this.interactableList = [];
      if (this.chunks.length > 0) {
        this.chunks.forEach((c) => {
          if (c.loaded && c.mesh && c.mesh.visible) {
            this.interactableList.push(c.mesh);
          }
        });
      }
      const traverseLimit = (o, depth) => {
        if (depth > 10) return;
        if (!o.visible) return;
        if (o.userData.chunkId) return;
        if (o.isMesh || o.isBatchedMesh) {
          if (!o.userData.isOptimized) {
            this.interactableList.push(o);
          }
        } else if (o.children.length > 0) {
          for (const child of o.children) {
            traverseLimit(child, depth + 1);
          }
        }
      };
      for (const child of this.contentGroup.children) {
        if (child.userData.isOptimizedGroup) continue;
        traverseLimit(child, 0);
      }
      this.interactableListValid = true;
    }
    const intersects = this.raycaster.intersectObjects(this.interactableList, false);
    if (intersects.length > 0) {
      const hit = intersects[0];
      if (hit.object.isBatchedMesh) {
        const bm = hit.object;
        const batchId = hit.batchId !== void 0 ? hit.batchId : hit.instanceId;
        if (batchId !== void 0) {
          const originalUuid = bm.userData.batchIdToUuid?.get(batchId);
          if (originalUuid) {
            const originalObj = this.contentGroup.getObjectByProperty("uuid", originalUuid);
            if (originalObj) {
              hit.object = originalObj;
            } else {
              const nodes = this.nodeMap.get(originalUuid);
              const node = nodes?.[0];
              const proxy = new THREE.Object3D();
              proxy.uuid = originalUuid;
              if (node) {
                proxy.name = node.name;
                proxy.type = node.type;
                proxy.isMesh = node.type === "Mesh";
              }
              proxy.getWorldPosition = (v) => {
                const mat2 = new THREE.Matrix4();
                bm.getMatrixAt(batchId, mat2);
                mat2.premultiply(bm.matrixWorld);
                return v.setFromMatrixPosition(mat2);
              };
              const mat = new THREE.Matrix4();
              bm.getMatrixAt(batchId, mat);
              proxy.position.setFromMatrixPosition(mat);
              hit.object = proxy;
            }
          }
        }
      }
      return hit;
    }
    return null;
  }
  computeTotalBounds(onlyVisible = false, forceRecompute = false) {
    if (!onlyVisible && !forceRecompute && !this.precomputedBounds.isEmpty()) {
      const box = this.precomputedBounds.clone();
      if (this.globalOffset.length() > 0) {
        box.translate(this.globalOffset.clone().negate());
      }
      return box;
    }
    const totalBox = new THREE.Box3();
    this.contentGroup.updateMatrixWorld(true);
    this.contentGroup.traverse((obj) => {
      if (onlyVisible && !obj.visible) return;
      if (obj.name === "3D Tileset" && this.tilesRenderer) {
        const tilesBox = new THREE.Box3();
        if (this.tilesRenderer.getBounds) {
          this.tilesRenderer.getBounds(tilesBox);
          if (!tilesBox.isEmpty() && this.globalOffset.length() > 0) {
            if (Math.abs(tilesBox.min.x) > 1e5 || Math.abs(tilesBox.min.y) > 1e5) {
              tilesBox.translate(this.globalOffset.clone().negate());
            }
          }
          if (!tilesBox.isEmpty()) totalBox.union(tilesBox);
        }
        obj.traverse((child) => {
          if (child !== obj) child._skipTraverse = true;
        });
      } else if (obj.isMesh && !obj._skipTraverse) {
        const mesh = obj;
        if (mesh.geometry) {
          const box = new THREE.Box3().setFromObject(mesh);
          if (!box.isEmpty()) totalBox.union(box);
        }
      } else if (obj.isBatchedMesh && !obj._skipTraverse) {
        const bm = obj;
        if (bm.computeBoundingBox) {
          bm.computeBoundingBox();
          if (bm.boundingBox) {
            const box = bm.boundingBox.clone().applyMatrix4(bm.matrixWorld);
            totalBox.union(box);
          }
        } else {
          const box = new THREE.Box3().setFromObject(bm);
          if (!box.isEmpty()) totalBox.union(box);
        }
      }
    });
    this.contentGroup.traverse((obj) => {
      delete obj._skipTraverse;
    });
    if (this.chunks.length > 0) {
      this.chunks.forEach((c) => {
        if (!onlyVisible || c.loaded) {
          totalBox.union(c.bounds);
        }
      });
    }
    if (totalBox.isEmpty() && !this.precomputedBounds.isEmpty()) {
      const fallback = this.precomputedBounds.clone();
      if (this.globalOffset.length() > 0) {
        fallback.translate(this.globalOffset.clone().negate());
      }
      return fallback;
    }
    return totalBox;
  }
  updateSceneBounds() {
    const fullBox = this.computeTotalBounds(false, true);
    this.precomputedBounds = fullBox.clone();
    if (this.globalOffset.length() > 0) {
      this.precomputedBounds.translate(this.globalOffset);
    }
    this.sceneBounds.copy(fullBox);
    this.sceneSphereValid = false;
  }
  fitView(keepOrientation = true) {
    this.contentGroup.updateMatrixWorld(true);
    let box = this.computeTotalBounds(true);
    if (box.isEmpty()) {
      box = this.computeTotalBounds(false);
    }
    this.sceneBounds = box.clone();
    this.fitBox(box, !keepOrientation);
  }
  fitViewToObject(uuid) {
    const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
    if (!obj) return;
    const box = new THREE.Box3();
    if (obj.userData.boundingBox) {
      box.copy(obj.userData.boundingBox).applyMatrix4(obj.matrixWorld);
    } else {
      box.setFromObject(obj);
    }
    if (!box.isEmpty()) this.fitBox(box, false);
  }
  fitBox(box, updateCameraPosition = true) {
    if (box.isEmpty()) {
      this.camera.zoom = 1;
      this.camera.position.set(1e3, 1e3, 1e3);
      this.camera.lookAt(0, 0, 0);
      this.controls.target.set(0, 0, 0);
      this.camera.updateProjectionMatrix();
      this.controls.update();
      return;
    }
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const extent = maxDim > 0 ? maxDim : 100;
    const padding = 1.2;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const aspect = w / h;
    let fH, fW;
    if (aspect >= 1) {
      fH = extent * padding;
      fW = fH * aspect;
    } else {
      fW = extent * padding;
      fH = fW / aspect;
    }
    const zBuffer = Math.max(extent * 5, 2e3);
    this.camera.near = -zBuffer;
    this.camera.far = zBuffer;
    let targetZoom = 1;
    let targetLeft = -fW / 2;
    let targetRight = fW / 2;
    let targetTop = fH / 2;
    let targetBottom = -fH / 2;
    if (updateCameraPosition) {
      const offset = new THREE.Vector3(1, -1, 1).normalize();
      const dist = Math.max(extent * 2, 2e3);
      const targetPosition = center.clone().add(offset.multiplyScalar(dist));
      const targetLookAt = center.clone();
      const startPosition = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      const startTime = performance.now();
      const duration = 600;
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.camera.position.lerpVectors(startPosition, targetPosition, eased);
        this.controls.target.lerpVectors(startTarget, targetLookAt, eased);
        this.camera.lookAt(this.controls.target);
        this.camera.zoom = 1 + (targetZoom - 1) * eased;
        this.camera.left = this.camera.left + (targetLeft - this.camera.left) * eased;
        this.camera.right = this.camera.right + (targetRight - this.camera.right) * eased;
        this.camera.top = this.camera.top + (targetTop - this.camera.top) * eased;
        this.camera.bottom = this.camera.bottom + (targetBottom - this.camera.bottom) * eased;
        this.camera.updateProjectionMatrix();
        this.controls.update();
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      animate();
    } else {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      const dist = this.camera.position.distanceTo(this.controls.target);
      const targetPosition = center.clone().add(direction.multiplyScalar(-dist));
      const targetLookAt = center.clone();
      const startPosition = this.camera.position.clone();
      const startTarget = this.controls.target.clone();
      const startTime = performance.now();
      const duration = 600;
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        this.camera.position.lerpVectors(startPosition, targetPosition, eased);
        this.controls.target.lerpVectors(startTarget, targetLookAt, eased);
        this.camera.lookAt(this.controls.target);
        this.camera.left = this.camera.left + (targetLeft - this.camera.left) * eased;
        this.camera.right = this.camera.right + (targetRight - this.camera.right) * eased;
        this.camera.top = this.camera.top + (targetTop - this.camera.top) * eased;
        this.camera.bottom = this.camera.bottom + (targetBottom - this.camera.bottom) * eased;
        this.camera.updateProjectionMatrix();
        this.controls.update();
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      animate();
    }
  }
  setView(view) {
    let box = this.computeTotalBounds(true);
    if (box.isEmpty()) box = this.computeTotalBounds(false);
    this.sceneBounds = box.clone();
    const center = box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? new THREE.Vector3(100, 100, 100) : box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = Math.max(maxDim * 2, 10);
    let pos = new THREE.Vector3();
    switch (view) {
      case "top":
        pos.set(0, 0, dist);
        break;
      case "bottom":
        pos.set(0, 0, -dist);
        break;
      case "front":
        pos.set(0, -dist, 0);
        break;
      case "back":
        pos.set(0, dist, 0);
        break;
      case "left":
        pos.set(-dist, 0, 0);
        break;
      case "right":
        pos.set(dist, 0, 0);
        break;
      case "se":
      case "top-front-right":
        pos.set(dist, -dist, dist);
        break;
      case "sw":
      case "top-front-left":
        pos.set(-dist, -dist, dist);
        break;
      case "ne":
      case "top-back-right":
        pos.set(dist, dist, dist);
        break;
      case "nw":
      case "top-back-left":
        pos.set(-dist, dist, dist);
        break;
      case "bottom-front-right":
        pos.set(dist, -dist, -dist);
        break;
      case "bottom-front-left":
        pos.set(-dist, -dist, -dist);
        break;
      case "bottom-back-right":
        pos.set(dist, dist, -dist);
        break;
      case "bottom-back-left":
        pos.set(-dist, dist, -dist);
        break;
      case "top-front":
        pos.set(0, -dist, dist);
        break;
      case "top-back":
        pos.set(0, dist, dist);
        break;
      case "top-left":
        pos.set(-dist, 0, dist);
        break;
      case "top-right":
        pos.set(dist, 0, dist);
        break;
      case "bottom-front":
        pos.set(0, -dist, -dist);
        break;
      case "bottom-back":
        pos.set(0, dist, -dist);
        break;
      case "bottom-left":
        pos.set(-dist, 0, -dist);
        break;
      case "bottom-right":
        pos.set(dist, 0, -dist);
        break;
      case "front-left":
        pos.set(-dist, -dist, 0);
        break;
      case "front-right":
        pos.set(dist, -dist, 0);
        break;
      case "back-left":
        pos.set(-dist, dist, 0);
        break;
      case "back-right":
        pos.set(dist, dist, 0);
        break;
    }
    if (pos.lengthSq() > 0) {
      pos.normalize().multiplyScalar(dist);
      this.camera.position.copy(center).add(pos);
      this.camera.lookAt(center);
      this.controls.target.copy(center);
      this.controls.update();
      this.fitBox(box, false);
    }
  }
  getCameraState() {
    return {
      position: this.camera.position.toArray(),
      target: this.controls.target.toArray(),
      zoom: this.camera.zoom,
      left: this.camera.left,
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom
    };
  }
  setCameraState(state) {
    if (!state) return;
    this.camera.position.fromArray(state.position);
    this.controls.target.fromArray(state.target);
    if (state.zoom !== void 0) this.camera.zoom = state.zoom;
    if (state.left !== void 0) this.camera.left = state.left;
    if (state.right !== void 0) this.camera.right = state.right;
    if (state.top !== void 0) this.camera.top = state.top;
    if (state.bottom !== void 0) this.camera.bottom = state.bottom;
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  // --- 测量定位逻辑 ---
  locateMeasurement(id) {
    const record = this.measureRecords.get(id);
    if (!record) return;
    const box = new THREE.Box3();
    record.group.traverse((obj) => {
      if (obj.isMesh || obj.isLine || obj.isSprite) {
        obj.updateMatrixWorld();
        if (obj.geometry) {
          if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
          const b = obj.geometry.boundingBox.clone();
          b.applyMatrix4(obj.matrixWorld);
          box.union(b);
        }
      }
    });
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    this.controls.target.copy(center);
    const targetZoom = (this.camera.top - this.camera.bottom) / (maxDim * 0.5);
    this.camera.zoom = Math.min(targetZoom, 100);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }
  // --- 测量逻辑 ---
  startMeasurement(type) {
    this.measureType = type;
    this.currentMeasurePoints = [];
    this.currentMeasureModelUuid = null;
    this.clearMeasurementPreview();
  }
  addMeasurePoint(point, modelUuid) {
    if (this.measureType === "none") return null;
    if (modelUuid) {
      this.currentMeasureModelUuid = modelUuid;
    }
    this.currentMeasurePoints.push(point);
    this.addMarker(point, this.measureGroup);
    if (this.measureType === "dist" && this.currentMeasurePoints.length === 2) {
      return this.finalizeMeasurement();
    } else if (this.measureType === "angle" && this.currentMeasurePoints.length === 3) {
      return this.finalizeMeasurement();
    } else if (this.measureType === "coord") {
      return this.finalizeMeasurement();
    }
    this.updateMeasurePreview();
    return null;
  }
  updateMeasurePreview(hoverPoint) {
    if (this.previewLine) {
      this.measureGroup.remove(this.previewLine);
      this.previewLine = null;
    }
    if (this.previewPolygon) {
      this.measureGroup.remove(this.previewPolygon);
      this.previewPolygon = null;
    }
    const points = [...this.currentMeasurePoints];
    if (hoverPoint) points.push(hoverPoint);
    if (points.length < 2) return;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 16711680,
      dashSize: 5,
      gapSize: 2,
      depthTest: false
    });
    this.previewLine = new THREE.Line(geometry, material);
    this.previewLine.computeLineDistances();
    this.previewLine.renderOrder = 998;
    this.measureGroup.add(this.previewLine);
  }
  updateMeasureHover(clientX, clientY) {
    if (this.measureType === "none") {
      this.tempMarker.visible = false;
      return;
    }
    const intersect = this.getRayIntersects(clientX, clientY);
    if (intersect) {
      const p = intersect.point;
      const attr = this.tempMarker.geometry.attributes.position;
      attr.setXYZ(0, p.x, p.y, p.z);
      attr.needsUpdate = true;
      this.tempMarker.visible = true;
      if (this.currentMeasurePoints.length > 0) {
        this.updateMeasurePreview(p);
      }
    } else {
      this.tempMarker.visible = false;
      if (this.previewLine) this.previewLine.visible = false;
    }
  }
  finalizeMeasurement() {
    const id = `measure_${Date.now()}`;
    const group = new THREE.Group();
    group.name = id;
    this.currentMeasurePoints.forEach((p) => this.addMarker(p, group));
    let valStr = "";
    let displayVal = "";
    let typeStr = this.measureType;
    let labelPos = new THREE.Vector3();
    if (this.measureType === "dist") {
      const p1 = this.currentMeasurePoints[0];
      const p2 = this.currentMeasurePoints[1];
      const dist = p1.distanceTo(p2);
      const dx = Math.abs(p2.x - p1.x);
      const dy = Math.abs(p2.y - p1.y);
      const dz = Math.abs(p2.z - p1.z);
      displayVal = dist.toFixed(3);
      valStr = `${displayVal} (Δx:${dx.toFixed(2)}, Δy:${dy.toFixed(2)}, Δz:${dz.toFixed(2)})`;
      this.addLine(this.currentMeasurePoints, group);
      labelPos.copy(p1).add(p2).multiplyScalar(0.5);
    } else if (this.measureType === "angle") {
      const p1 = this.currentMeasurePoints[0];
      const center = this.currentMeasurePoints[1];
      const p2 = this.currentMeasurePoints[2];
      const v1 = p1.clone().sub(center).normalize();
      const v2 = p2.clone().sub(center).normalize();
      const angle = v1.angleTo(v2) * (180 / Math.PI);
      displayVal = angle.toFixed(2) + "°";
      valStr = displayVal;
      this.addLine(this.currentMeasurePoints, group);
      labelPos.copy(center);
    } else {
      const p = this.currentMeasurePoints[0];
      displayVal = `(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`;
      valStr = displayVal;
      labelPos.copy(p);
    }
    const label = this.createLabel(displayVal, labelPos);
    group.add(label);
    this.measureGroup.add(group);
    this.measureRecords.set(id, {
      id,
      type: typeStr,
      val: valStr,
      group,
      modelUuid: this.currentMeasureModelUuid || void 0
    });
    this.currentMeasurePoints = [];
    this.currentMeasureModelUuid = null;
    this.clearMeasurementPreview();
    if (this.onMeasureUpdate) {
      this.onMeasureUpdate(Array.from(this.measureRecords.values()));
    }
    return { id, type: typeStr, val: valStr };
  }
  createLabel(text, position) {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.Sprite();
    const fontSize = 48;
    const padding = 24;
    ctx.font = `Bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
    const textWidth = ctx.measureText(text).width;
    canvas.width = textWidth + padding * 2;
    canvas.height = fontSize + padding;
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(30, 30, 30, 0.9)";
    const radius = 8;
    if (ctx.roundRect) {
      ctx.roundRect(5, 5, canvas.width - 10, canvas.height - 10, radius);
    } else {
      ctx.rect(5, 5, canvas.width - 10, canvas.height - 10);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = `Bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      sizeAttenuation: false
      // 关键：使文字不受相机缩放影响
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.position.copy(position);
    const baseScale = 0.5;
    sprite.scale.set(baseScale * (canvas.width / canvas.height), baseScale, 1);
    sprite.renderOrder = 1001;
    sprite.userData = { type: "label" };
    return sprite;
  }
  highlightMeasurement(id) {
    this.measureRecords.forEach((record, rid) => {
      const isHighlighted = rid === id;
      const color = isHighlighted ? 65280 : 16711680;
      record.group.traverse((child) => {
        if (child instanceof THREE.Line || child instanceof THREE.LineLoop) {
          child.material.color.set(color);
        } else if (child instanceof THREE.Points) {
          child.material.color.set(color);
        } else if (child instanceof THREE.Sprite) {
          child.material.color.set(isHighlighted ? 65280 : 16777215);
        } else if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial) {
          child.material.color.set(color);
        } else if (child instanceof THREE.Box3Helper) {
          child.material.color.set(color);
        }
      });
    });
  }
  pickMeasurement(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = (clientX - rect.left) / rect.width * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const oldThreshold = this.raycaster.params.Line?.threshold || 0;
    if (this.raycaster.params.Line) this.raycaster.params.Line.threshold = 5;
    const intersects = this.raycaster.intersectObjects(this.measureGroup.children, true);
    if (this.raycaster.params.Line) this.raycaster.params.Line.threshold = oldThreshold;
    if (intersects.length > 0) {
      let obj = intersects[0].object;
      while (obj.parent && !obj.name.startsWith("measure_")) {
        obj = obj.parent;
      }
      if (obj.name.startsWith("measure_")) {
        return obj.name;
      }
    }
    return null;
  }
  addMarker(point, parent) {
    const markerGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([point.x, point.y, point.z], 3));
    const markerMat = new THREE.PointsMaterial({ color: 16711680, size: 8, map: this.dotTexture, transparent: true, alphaTest: 0.5, depthTest: false });
    const marker = new THREE.Points(markerGeo, markerMat);
    marker.renderOrder = 999;
    parent.add(marker);
  }
  addLine(points, parent) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 16711680, depthTest: false, linewidth: 2 });
    const line = new THREE.Line(geometry, material);
    line.renderOrder = 998;
    parent.add(line);
  }
  addLineLoop(points, parent) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 16711680, depthTest: false, linewidth: 2 });
    const line = new THREE.LineLoop(geometry, material);
    line.renderOrder = 998;
    parent.add(line);
  }
  addPolygonFill(points, parent) {
    if (points.length < 3) return;
    const shape = new THREE.Shape();
    const v1 = new THREE.Vector3().subVectors(points[1], points[0]);
    const v2 = new THREE.Vector3().subVectors(points[2], points[0]);
    const normal = new THREE.Vector3().crossVectors(v1, v2).normalize();
    const tangent = v1.normalize();
    const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    const origin = points[0];
    const toLocal = (p) => {
      const d = new THREE.Vector3().subVectors(p, origin);
      return [d.dot(tangent), d.dot(bitangent)];
    };
    shape.moveTo(...toLocal(points[0]));
    for (let i = 1; i < points.length; i++) {
      shape.lineTo(...toLocal(points[i]));
    }
    shape.closePath();
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
      color: 16711680,
      transparent: true,
      opacity: 0.15,
      depthTest: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 997;
    const matrix = new THREE.Matrix4();
    matrix.makeBasis(tangent, bitangent, normal);
    matrix.setPosition(origin);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    mesh.applyMatrix4(matrix);
    parent.add(mesh);
  }
  computeGeometryVolume(geometry, mesh, instanceId) {
    const pos = geometry.attributes.position;
    const index = geometry.index;
    let volume = 0;
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const tmpMat = new THREE.Matrix4();
    if (instanceId !== void 0 && mesh.isInstancedMesh) {
      mesh.getMatrixAt(instanceId, tmpMat);
    } else {
      tmpMat.copy(mesh.matrixWorld);
    }
    const applyMatrix = (v) => {
      v.applyMatrix4(tmpMat);
    };
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        vA.fromBufferAttribute(pos, index.getX(i));
        vB.fromBufferAttribute(pos, index.getX(i + 1));
        vC.fromBufferAttribute(pos, index.getX(i + 2));
        applyMatrix(vA);
        applyMatrix(vB);
        applyMatrix(vC);
        volume += vA.dot(new THREE.Vector3().crossVectors(vB, vC)) / 6;
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        vA.fromBufferAttribute(pos, i);
        vB.fromBufferAttribute(pos, i + 1);
        vC.fromBufferAttribute(pos, i + 2);
        applyMatrix(vA);
        applyMatrix(vB);
        applyMatrix(vC);
        volume += vA.dot(new THREE.Vector3().crossVectors(vB, vC)) / 6;
      }
    }
    return Math.abs(volume);
  }
  computeGeometryArea(geometry, mesh, instanceId) {
    const pos = geometry.attributes.position;
    const index = geometry.index;
    let area = 0;
    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const tmpMat = new THREE.Matrix4();
    if (instanceId !== void 0 && mesh.isInstancedMesh) {
      mesh.getMatrixAt(instanceId, tmpMat);
    } else {
      tmpMat.copy(mesh.matrixWorld);
    }
    const applyMatrix = (v) => {
      v.applyMatrix4(tmpMat);
    };
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        vA.fromBufferAttribute(pos, index.getX(i));
        vB.fromBufferAttribute(pos, index.getX(i + 1));
        vC.fromBufferAttribute(pos, index.getX(i + 2));
        applyMatrix(vA);
        applyMatrix(vB);
        applyMatrix(vC);
        const ab = new THREE.Vector3().subVectors(vB, vA);
        const ac = new THREE.Vector3().subVectors(vC, vA);
        area += ab.cross(ac).length() / 2;
      }
    } else {
      for (let i = 0; i < pos.count; i += 3) {
        vA.fromBufferAttribute(pos, i);
        vB.fromBufferAttribute(pos, i + 1);
        vC.fromBufferAttribute(pos, i + 2);
        applyMatrix(vA);
        applyMatrix(vB);
        applyMatrix(vC);
        const ab = new THREE.Vector3().subVectors(vB, vA);
        const ac = new THREE.Vector3().subVectors(vC, vA);
        area += ab.cross(ac).length() / 2;
      }
    }
    return area;
  }
  /**
   * 获取对象的面积和体积
   */
  getObjectGeometryData(uuid) {
    let area = 0;
    let volume = 0;
    const mappings = this.optimizedMapping.get(uuid);
    if (mappings && mappings.length > 0) {
      mappings.forEach((m) => {
        if (m.geometry) {
          area += this.computeGeometryArea(m.geometry, m.mesh, m.instanceId);
          volume += this.computeGeometryVolume(m.geometry, m.mesh, m.instanceId);
        }
      });
    } else {
      const obj = this.contentGroup.getObjectByProperty("uuid", uuid);
      if (obj && obj.isMesh) {
        const mesh = obj;
        if (mesh.geometry) {
          area = this.computeGeometryArea(mesh.geometry, mesh, void 0);
          volume = this.computeGeometryVolume(mesh.geometry, mesh, void 0);
        }
      }
    }
    return { area, volume };
  }
  // ========== 框选方法 ==========
  /**
   * 开始框选
   */
  startBoxSelect(clientX, clientY) {
    this.boxSelectState.active = true;
    this.boxSelectState.startX = clientX;
    this.boxSelectState.startY = clientY;
    this.boxSelectState.endX = clientX;
    this.boxSelectState.endY = clientY;
    this.updateBoxSelectRect();
  }
  /**
   * 更新框选范围
   */
  updateBoxSelect(clientX, clientY) {
    if (!this.boxSelectState.active) return;
    this.boxSelectState.endX = clientX;
    this.boxSelectState.endY = clientY;
    this.updateBoxSelectRect();
  }
  /**
   * 完成框选，返回选中的对象 UUID 列表
   */
  endBoxSelect() {
    if (!this.boxSelectState.active) return [];
    this.boxSelectState.active = false;
    this.removeBoxSelectRect();
    const { startX, startY, endX, endY } = this.boxSelectState;
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    if (dx < 5 || dy < 5) return [];
    const rect = this.canvas.getBoundingClientRect();
    const x1 = (Math.min(startX, endX) - rect.left) / rect.width * 2 - 1;
    const y1 = -(Math.max(startY, endY) - rect.top) / rect.height * 2 + 1;
    const x2 = (Math.max(startX, endX) - rect.left) / rect.width * 2 - 1;
    const y2 = -(Math.min(startY, endY) - rect.top) / rect.height * 2 + 1;
    return this.selectByScreenRect(x1, y1, x2, y2);
  }
  /**
   * 取消框选
   */
  cancelBoxSelect() {
    this.boxSelectState.active = false;
    this.removeBoxSelectRect();
  }
  updateBoxSelectRect() {
    const state = this.boxSelectState;
    if (!state.rectElement) {
      state.rectElement = document.createElement("div");
      state.rectElement.style.cssText = `
                position: fixed; border: 1px dashed #00aaff;
                background: rgba(0, 170, 255, 0.08); pointer-events: none; z-index: 1000;
            `;
      document.body.appendChild(state.rectElement);
    }
    const { startX, startY, endX, endY } = state;
    state.rectElement.style.left = Math.min(startX, endX) + "px";
    state.rectElement.style.top = Math.min(startY, endY) + "px";
    state.rectElement.style.width = Math.abs(endX - startX) + "px";
    state.rectElement.style.height = Math.abs(endY - startY) + "px";
  }
  removeBoxSelectRect() {
    if (this.boxSelectState.rectElement) {
      this.boxSelectState.rectElement.remove();
      this.boxSelectState.rectElement = null;
    }
  }
  /**
   * 通过屏幕矩形选择对象
   */
  selectByScreenRect(x1, y1, x2, y2) {
    if (!this.interactableListValid) {
      this.getRayIntersects(0, 0);
    }
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    const originalMatrix = this.camera.projectionMatrix.clone();
    const newMatrix = new THREE.Matrix4();
    const selectWidth = maxX - minX;
    const selectHeight = maxY - minY;
    const scaleX = selectWidth / 2;
    const scaleY = selectHeight / 2;
    const centerX = (maxX + minX) / 2;
    const centerY = (maxY + minY) / 2;
    const translateMatrix = new THREE.Matrix4().makeTranslation(-centerX, -centerY, 0);
    const scaleMatrix = new THREE.Matrix4().makeScale(1 / scaleX, 1 / scaleY, 1);
    newMatrix.multiplyMatrices(scaleMatrix, translateMatrix);
    const modifiedProjectionMatrix = newMatrix.multiply(originalMatrix);
    const frustum = new THREE.Frustum();
    const viewMatrix = this.camera.matrixWorldInverse;
    const projViewMatrix = modifiedProjectionMatrix.clone().multiply(viewMatrix);
    frustum.setFromProjectionMatrix(projViewMatrix);
    const selected = [];
    const box = new THREE.Box3();
    const tmpMat = new THREE.Matrix4();
    for (const obj of this.interactableList) {
      if (obj.isBatchedMesh) {
        const bm = obj;
        const batchIdToUuid = bm.userData.batchIdToUuid;
        const batchIdToGeometry = bm.userData.batchIdToGeometry;
        if (!batchIdToUuid || !batchIdToGeometry) continue;
        for (const [batchId, uuid] of batchIdToUuid) {
          try {
            const geometry = batchIdToGeometry.get(batchId);
            if (!geometry) continue;
            bm.getMatrixAt(batchId, tmpMat);
            tmpMat.premultiply(bm.matrixWorld);
            const geoBox = new THREE.Box3();
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            geoBox.copy(geometry.boundingBox).applyMatrix4(tmpMat);
            if (frustum.intersectsBox(geoBox)) {
              selected.push(uuid);
            }
          } catch (e) {
          }
        }
        continue;
      }
      box.setFromObject(obj);
      if (frustum.intersectsBox(box)) {
        selected.push(obj.uuid);
      }
    }
    return selected;
  }
  removeMeasurement(id) {
    if (this.measureRecords.has(id)) {
      const record = this.measureRecords.get(id);
      if (record) {
        this.measureGroup.remove(record.group);
        this.measureRecords.delete(id);
        if (this.onMeasureUpdate) {
          this.onMeasureUpdate(Array.from(this.measureRecords.values()));
        }
      }
    }
  }
  clearAllMeasurements() {
    this.measureRecords.forEach((record) => {
      this.measureGroup.remove(record.group);
    });
    this.measureRecords.clear();
    this.clearMeasurementPreview();
    if (this.onMeasureUpdate) {
      this.onMeasureUpdate([]);
    }
  }
  clearMeasurementPreview() {
    this.currentMeasurePoints = [];
    if (this.previewLine) {
      this.measureGroup.remove(this.previewLine);
      this.previewLine = null;
    }
    if (this.previewPolygon) {
      this.measureGroup.remove(this.previewPolygon);
      this.previewPolygon = null;
    }
    this.tempMarker.visible = false;
    for (let i = this.measureGroup.children.length - 1; i >= 0; i--) {
      const child = this.measureGroup.children[i];
      if (!child.name.startsWith("measure_") && child !== this.previewLine && child !== this.previewPolygon) {
        this.measureGroup.remove(child);
      }
    }
  }
  // --- 剖切逻辑 ---
  setupClipping() {
    this.clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
    ];
    this.renderer.clippingPlanes = [];
    const colors = [16711680, 16711680, 65280, 65280, 255, 255];
    this.clipPlaneHelpers = [];
    this.clipHelpersGroup.clear();
    for (let i = 0; i < 6; i++) {
      const geom = new THREE.PlaneGeometry(1, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        clippingPlanes: []
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      mesh.renderOrder = 9999;
      const edges = new THREE.EdgesGeometry(geom);
      const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: colors[i],
        transparent: true,
        opacity: 0.3,
        depthWrite: false
      }));
      line.visible = false;
      line.renderOrder = 1e4;
      mesh.add(line);
      this.clipPlaneHelpers.push(mesh);
      this.clipHelpersGroup.add(mesh);
    }
  }
  setClippingEnabled(enabled) {
    this.renderer.clippingPlanes = enabled ? this.clippingPlanes : [];
    if (!enabled) {
      this.clipPlaneHelpers.forEach((h) => h.visible = false);
    }
  }
  updateClippingPlanes(bounds, values, active) {
    if (bounds.isEmpty()) return;
    const { min, max } = bounds;
    const size = max.clone().sub(min);
    const center = bounds.getCenter(new THREE.Vector3());
    const diagonal = size.length();
    const helperSize = diagonal > 0 ? diagonal * 1.2 : 1e3;
    const xMin = min.x + values.x[0] / 100 * size.x;
    const xMax = min.x + values.x[1] / 100 * size.x;
    const yMin = min.y + values.y[0] / 100 * size.y;
    const yMax = min.y + values.y[1] / 100 * size.y;
    const zMin = min.z + values.z[0] / 100 * size.z;
    const zMax = min.z + values.z[1] / 100 * size.z;
    const isEnabled = this.renderer.clippingPlanes.length > 0;
    if (active.x) {
      this.clippingPlanes[0].constant = -xMin;
      this.clippingPlanes[1].constant = xMax;
      this.updatePlaneHelper(0, new THREE.Vector3(1, 0, 0), xMin, center, helperSize, isEnabled);
      this.updatePlaneHelper(1, new THREE.Vector3(-1, 0, 0), xMax, center, helperSize, isEnabled);
    } else {
      this.clippingPlanes[0].constant = Infinity;
      this.clippingPlanes[1].constant = Infinity;
      this.clipPlaneHelpers[0].visible = false;
      this.clipPlaneHelpers[1].visible = false;
    }
    if (active.y) {
      this.clippingPlanes[2].constant = -yMin;
      this.clippingPlanes[3].constant = yMax;
      this.updatePlaneHelper(2, new THREE.Vector3(0, 1, 0), yMin, center, helperSize, isEnabled);
      this.updatePlaneHelper(3, new THREE.Vector3(0, -1, 0), yMax, center, helperSize, isEnabled);
    } else {
      this.clippingPlanes[2].constant = Infinity;
      this.clippingPlanes[3].constant = Infinity;
      this.clipPlaneHelpers[2].visible = false;
      this.clipPlaneHelpers[3].visible = false;
    }
    if (active.z) {
      this.clippingPlanes[4].constant = -zMin;
      this.clippingPlanes[5].constant = zMax;
      this.updatePlaneHelper(4, new THREE.Vector3(0, 0, 1), zMin, center, helperSize, isEnabled);
      this.updatePlaneHelper(5, new THREE.Vector3(0, 0, -1), zMax, center, helperSize, isEnabled);
    } else {
      this.clippingPlanes[4].constant = Infinity;
      this.clippingPlanes[5].constant = Infinity;
      this.clipPlaneHelpers[4].visible = false;
      this.clipPlaneHelpers[5].visible = false;
    }
  }
  updatePlaneHelper(idx, normal, dist, center, size, isEnabled) {
    const helper = this.clipPlaneHelpers[idx];
    if (!helper) return;
    helper.visible = isEnabled;
    helper.scale.set(size, size, 1);
    const pos = new THREE.Vector3(center.x, center.y, center.z);
    const epsilon = 1e-3;
    if (normal.x !== 0) pos.x = dist + normal.x * epsilon;
    else if (normal.y !== 0) pos.y = dist + normal.y * epsilon;
    else if (normal.z !== 0) pos.z = dist + normal.z * epsilon;
    helper.position.copy(pos);
    helper.lookAt(pos.clone().add(normal));
  }
  /**
   * 检查包围盒是否完全被当前剖切面裁剪掉
   * 如果包围盒完全在任意一个激活的剖切面的“背面”，则认为被裁剪
   */
  isBoxClipped(box) {
    for (const plane of this.clippingPlanes) {
      if (plane.constant === Infinity) continue;
      const planeNormal = plane.normal;
      const maxPoint = new THREE.Vector3(
        planeNormal.x > 0 ? box.max.x : box.min.x,
        planeNormal.y > 0 ? box.max.y : box.min.y,
        planeNormal.z > 0 ? box.max.z : box.min.z
      );
      if (plane.distanceToPoint(maxPoint) < 0) {
        return true;
      }
    }
    return false;
  }
  getStats() {
    let textureMemory = 0;
    const textures = /* @__PURE__ */ new Set();
    this.contentGroup.traverse((obj) => {
      if (obj.name === "__EdgesHelper") return;
      if (obj.isMesh || obj.isBatchedMesh) {
        const mesh = obj;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => {
          if (!material) return;
          Object.values(material).forEach((value) => {
            if (value instanceof THREE.Texture && !textures.has(value)) {
              textures.add(value);
              const image = value.image;
              const width = image?.width || 0;
              const height = image?.height || 0;
              if (width > 0 && height > 0) {
                textureMemory += width * height * 4 / (1024 * 1024);
              }
            }
          });
        });
      }
    });
    const drawCalls = this.renderer.info.render.calls;
    return {
      meshes: this.originalStats.meshes,
      faces: this.originalStats.faces,
      memory: parseFloat(this.originalStats.memory.toFixed(2)),
      textureMemory: parseFloat(textureMemory.toFixed(2)),
      drawCalls,
      fps: Math.round(this.fps),
      chunksLoaded: this.chunkLoadedCount,
      chunksTotal: this.chunks.length,
      chunksQueued: this.processingChunks.size,
      pixelRatio: Number(this.activePixelRatio.toFixed(2))
    };
  }
  dispose() {
    if (this.logicTimer) clearInterval(this.logicTimer);
    this.renderer.dispose();
    if (this.tilesRenderer) this.tilesRenderer.dispose();
  }
}

function normalizePath(path) {
  return path.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "").toLowerCase();
}
function candidateKeys(input) {
  const normalized = normalizePath(input);
  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1];
  return Array.from(/* @__PURE__ */ new Set([
    normalized,
    fileName,
    `./${normalized}`,
    `./${fileName}`
  ]));
}
function createResourceResolver(files) {
  const localFiles = files.filter((item) => item instanceof File);
  if (localFiles.length === 0) return null;
  const blobUrlMap = /* @__PURE__ */ new Map();
  const register = (key, file) => {
    if (!key || blobUrlMap.has(key)) return;
    blobUrlMap.set(key, URL.createObjectURL(file));
  };
  localFiles.forEach((file) => {
    register(normalizePath(file.name), file);
    const relativePath = file.webkitRelativePath;
    if (relativePath) {
      const trimmed = relativePath.split("/").slice(1).join("/");
      register(normalizePath(trimmed), file);
    }
  });
  return {
    resolve: (url) => {
      if (!url || /^(blob:|data:|https?:)/i.test(url)) return url;
      for (const key of candidateKeys(url)) {
        const resolved = blobUrlMap.get(key);
        if (resolved) return resolved;
      }
      return url;
    },
    has: (url) => candidateKeys(url).some((key) => blobUrlMap.has(key)),
    dispose: () => {
      blobUrlMap.forEach((blobUrl) => URL.revokeObjectURL(blobUrl));
      blobUrlMap.clear();
    }
  };
}

const STAGE_LABELS = {
  fetch: "reading",
  parse: "analyzing",
  normalize: "processing",
  optimize: "processing",
  addToScene: "processing"
};
const STAGE_WEIGHTS = {
  fetch: [0, 20],
  parse: [20, 58],
  normalize: [58, 72],
  optimize: [72, 92],
  addToScene: [92, 100]
};
const libPathCache = /* @__PURE__ */ new Map();
function normalizeLibPath(libPath) {
  if (!libPathCache.has(libPath)) {
    libPathCache.set(libPath, libPath.replace(/\/$/, ""));
  }
  return libPathCache.get(libPath);
}
function createLoadingManager(files, _libPath, _settings) {
  const resourceResolver = createResourceResolver(files);
  const manager = new THREE.LoadingManager();
  if (resourceResolver) {
    manager.setURLModifier((url) => resourceResolver.resolve(url));
  }
  const cleanup = () => {
    resourceResolver?.dispose();
  };
  return { manager, cleanup, resourceResolver };
}
async function createGltfLoaderRuntime(manager, libPath) {
  const [
    { GLTFLoader },
    { DRACOLoader },
    { KTX2Loader },
    { MeshoptDecoder }
  ] = await Promise.all([
    import('./loaders-MBHA5ASo.js').then(n => n.a),
    import('./loaders-MBHA5ASo.js').then(n => n.D),
    import('./loaders-MBHA5ASo.js').then(n => n.K),
    import('./meshopt_decoder.module-C_9D6xwu.js')
  ]);
  const normalizedLibPath = normalizeLibPath(libPath);
  const supportsCompressedTextures = typeof window !== "undefined" && !!window.createImageBitmap;
  let probeRenderer = null;
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath(`${normalizedLibPath}/draco/gltf/`);
  const ktx2Loader = new KTX2Loader(manager);
  ktx2Loader.setTranscoderPath(`${normalizedLibPath}/basis/`);
  if (typeof document !== "undefined") {
    try {
      probeRenderer = new THREE.WebGLRenderer({ canvas: document.createElement("canvas") });
      ktx2Loader.detectSupport(probeRenderer);
    } catch (error) {
      console.warn("[LoaderUtils] KTX2 detectSupport failed", error);
    }
  }
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (supportsCompressedTextures) {
    loader.setKTX2Loader(ktx2Loader);
  }
  return {
    loader,
    cleanup: () => {
      dracoLoader.dispose();
      ktx2Loader.dispose();
      probeRenderer?.dispose();
    }
  };
}
function createStageProgressReporter(onProgress, t, fileName, fileBaseProgress, fileWeight) {
  return (stage, progress, msg) => {
    const [start, end] = STAGE_WEIGHTS[stage];
    const safeP = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0));
    const stagePercent = start + safeP / 100 * (end - start);
    const totalPercent = fileBaseProgress + stagePercent / 100 * fileWeight;
    const label = msg || `${t(STAGE_LABELS[stage])} ${fileName}`;
    onProgress(Math.round(totalPercent), label);
  };
}
async function loadObjectByExtension(fileOrUrl, url, ext, files, reportStage, t, settings, libPath) {
  const loaderContext = createLoadingManager(files);
  const { manager, cleanup, resourceResolver } = loaderContext;
  try {
    if (ext === "lmb") {
      const { LMBLoader } = await import('./lmbLoader-DKeiizRf.js');
      const loader = new LMBLoader();
      reportStage("parse", 0);
      return await loader.loadAsync(url, (p) => reportStage("parse", p * 100));
    }
    if (ext === "glb" || ext === "gltf") {
      const { loader, cleanup: cleanupGltf } = await createGltfLoaderRuntime(manager, libPath);
      reportStage("parse", 0);
      try {
        const gltf = await new Promise((resolve, reject) => {
          loader.load(
            url,
            resolve,
            (e) => {
              if (e.total && e.total > 0) reportStage("parse", e.loaded / e.total * 100);
              else reportStage("parse", 50);
            },
            reject
          );
        });
        return gltf.scene;
      } finally {
        cleanupGltf();
      }
    }
    if (ext === "fbx") {
      const { FBXLoader } = await import('./loaders-MBHA5ASo.js').then(n => n.F);
      const loader = new FBXLoader(manager);
      reportStage("parse", 0);
      return await new Promise((resolve, reject) => {
        loader.load(
          url,
          resolve,
          (e) => {
            if (e.total && e.total > 0) reportStage("parse", e.loaded / e.total * 100);
            else reportStage("parse", 50);
          },
          reject
        );
      });
    }
    if (ext === "ifc") {
      const { loadIFC } = await import('./IFCLoader-COOPlyDB.js');
      reportStage("parse", 0);
      return await loadIFC(typeof fileOrUrl === "string" ? url : fileOrUrl, (p, msg) => reportStage("parse", p, msg), t, libPath);
    }
    if (ext === "obj") {
      const [{ OBJLoader }, { MTLLoader }] = await Promise.all([
        import('./loaders-MBHA5ASo.js').then(n => n.b),
        import('./loaders-MBHA5ASo.js').then(n => n.M)
      ]);
      const objLoader = new OBJLoader(manager);
      const mtlName = url.replace(/\.[^.]+$/i, ".mtl");
      if (resourceResolver?.has(mtlName)) {
        try {
          const materials = await new Promise((resolve, reject) => {
            const mtlLoader = new MTLLoader(manager);
            mtlLoader.load(mtlName, resolve, void 0, reject);
          });
          materials.preload();
          objLoader.setMaterials(materials);
        } catch (error) {
          console.warn("[LoaderUtils] Failed to load companion MTL", error);
        }
      }
      reportStage("parse", 0);
      return await objLoader.loadAsync(url, (e) => {
        if (e.total && e.total > 0) reportStage("parse", e.loaded / e.total * 100);
        else reportStage("parse", 50);
      });
    }
    if (ext === "stl") {
      const { STLLoader } = await import('./loaders-MBHA5ASo.js').then(n => n.S);
      const loader = new STLLoader(manager);
      reportStage("parse", 0);
      const geometry = await loader.loadAsync(url, (e) => {
        if (e.total && e.total > 0) reportStage("parse", e.loaded / e.total * 100);
      });
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 8947848 }));
    }
    if (ext === "ply") {
      const { PLYLoader } = await import('./loaders-MBHA5ASo.js').then(n => n.P);
      const loader = new PLYLoader(manager);
      reportStage("parse", 0);
      const geometry = await loader.loadAsync(url, (e) => {
        if (e.total && e.total > 0) reportStage("parse", e.loaded / e.total * 100);
      });
      return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: 8947848,
        vertexColors: geometry.hasAttribute("color")
      }));
    }
    if (ext === "3mf") {
      const { ThreeMFLoader } = await import('./loaders-MBHA5ASo.js').then(n => n._);
      const loader = new ThreeMFLoader(manager);
      reportStage("parse", 0);
      return await loader.loadAsync(url, (e) => {
        if (e.total && e.total > 0) reportStage("parse", e.loaded / e.total * 100);
      });
    }
    if (ext === "stp" || ext === "step" || ext === "igs" || ext === "iges") {
      reportStage("fetch", 0);
      const buffer = typeof fileOrUrl === "string" ? await fetch(url).then((r) => r.arrayBuffer()) : await fileOrUrl.arrayBuffer();
      const wasmUrl = `${libPath}/occt-import-js/occt-import-js.wasm`;
      const { OCCTLoader } = await import('./OCCTLoader-CEso80J0.js');
      const loader = new OCCTLoader(wasmUrl);
      reportStage("parse", 0);
      return await loader.load(buffer, t, (p, msg) => reportStage("parse", p, msg));
    }
    return null;
  } finally {
    cleanup();
  }
}
function normalizeLoadedObject(object, settings) {
  object.traverse((child) => {
    if (child.isMesh) {
      const mesh = child;
      mesh.frustumCulled = settings.frustumCulling ?? true;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (!material) return;
        if ("wireframe" in material) {
          material.wireframe = false;
        }
      });
    }
  });
}
const loadModelFiles = async (files, onProgress, t, settings, libPath = "./libs") => {
  const loadedObjects = [];
  const totalFiles = files.length;
  for (let i = 0; i < totalFiles; i++) {
    const fileOrUrl = files[i];
    const isUrl = typeof fileOrUrl === "string";
    let fileName = "";
    let ext = "";
    let url = "";
    if (isUrl) {
      url = fileOrUrl;
      const urlPath = url.split("?")[0].split("#")[0];
      fileName = urlPath.split("/").pop() || "model";
      ext = fileName.split(".").pop()?.toLowerCase() || "";
    } else {
      fileName = fileOrUrl.name;
      ext = fileName.split(".").pop()?.toLowerCase() || "";
      url = URL.createObjectURL(fileOrUrl);
    }
    const fileBaseProgress = i / totalFiles * 100;
    const fileWeight = 100 / totalFiles;
    const reportStage = createStageProgressReporter(onProgress, t, fileName, fileBaseProgress, fileWeight);
    try {
      reportStage("fetch", 5);
      const object = await loadObjectByExtension(fileOrUrl, url, ext, files, reportStage, t, settings, libPath);
      if (!object) continue;
      object.name = fileName;
      reportStage("normalize", 30, `${t("processing")} ${fileName}`);
      normalizeLoadedObject(object, settings);
      reportStage("optimize", 100, `${t("analyzing")} ${fileName}`);
      reportStage("addToScene", 100, `${t("success")} ${fileName}`);
      loadedObjects.push(object);
    } catch (error) {
      console.error(`加载 ${fileName} 失败`, error);
    } finally {
      if (!isUrl) URL.revokeObjectURL(url);
    }
  }
  onProgress(100, t("analyzing"));
  return loadedObjects;
};
const parseTilesetFromFolder = async (files, onProgress, t) => {
  onProgress(10, t("analyzing"));
  const fileMap = /* @__PURE__ */ new Map();
  let tilesetKey = "";
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const pathParts = f.webkitRelativePath.split("/");
    const relPath = pathParts.slice(1).join("/");
    if (relPath) {
      fileMap.set(relPath, f);
      if (f.name === "tileset.json") tilesetKey = relPath;
    } else {
      fileMap.set(f.name, f);
      if (f.name === "tileset.json") tilesetKey = f.name;
    }
  }
  if (!tilesetKey && fileMap.has("tileset.json")) tilesetKey = "tileset.json";
  if (!tilesetKey) {
    throw new Error("在所选文件夹中未找到tileset.json");
  }
  onProgress(50, t("reading"));
  const blobUrlMap = /* @__PURE__ */ new Map();
  fileMap.forEach((blob2, path) => {
    blobUrlMap.set(path, URL.createObjectURL(blob2));
  });
  const tilesetFile = fileMap.get(tilesetKey);
  if (!tilesetFile) return null;
  const text = await tilesetFile.text();
  const json = JSON.parse(text);
  const replaceUris = (node) => {
    if (node.content && node.content.uri) {
      const mapped = blobUrlMap.get(node.content.uri);
      if (mapped) node.content.uri = mapped;
    }
    if (node.children) node.children.forEach(replaceUris);
  };
  replaceUris(json.root);
  onProgress(100, t("success"));
  const blob = new Blob([JSON.stringify(json)], { type: "application/json" });
  return URL.createObjectURL(blob);
};

const themes = {
  dark: {
    bg: "#1f2227",
    panelBg: "#282c31",
    headerBg: "#32363d",
    border: "#444b55",
    text: "#f1f1f1",
    textLight: "#ffffff",
    textMuted: "#999999",
    accent: "#007acc",
    highlight: "#3e3e42",
    itemHover: "rgba(255, 255, 255, 0.1)",
    success: "#4ec9b0",
    warning: "#ce9178",
    danger: "#f48771",
    canvasBg: "#2a2f36",
    shadow: "rgba(0, 0, 0, 0.5)"
  },
  light: {
    bg: "#ffffff",
    // 办公风格白色
    panelBg: "#ffffff",
    headerBg: "#f4f5f7",
    // 标签区域浅灰
    border: "#d2d2d2",
    // 办公风格边框色
    text: "#444444",
    textLight: "#000000",
    textMuted: "#666666",
    accent: "#2b579a",
    // 办公风格蓝（文字应用风格）
    highlight: "#cfe3ff",
    itemHover: "#e1e1e1",
    success: "#217346",
    // 成功绿
    warning: "#d24726",
    // 警告橙
    danger: "#a4262c",
    canvasBg: "#eef1f4",
    shadow: "rgba(0, 0, 0, 0.15)"
  }
};
const DEFAULT_FONT = "'Segoe UI', 'Microsoft YaHei', sans-serif";

const resources = {
  en: {
    home: "Home",
    menu_open_file: "Open File",
    menu_open_folder: "Open Folder",
    menu_open_url: "Open URL",
    menu_batch_convert: "Batch Convert",
    menu_file: "File",
    menu_export: "Export",
    interface_display: "Display",
    view: "View",
    menu_fit_view: "Fit View",
    view_top: "Top",
    view_bottom: "Bottom",
    view_front: "Front",
    view_back: "Back",
    view_left: "Left",
    view_right: "Right",
    view_se: "SE",
    view_sw: "SW",
    view_ne: "NE",
    view_nw: "NW",
    cube_top: "Top",
    cube_bottom: "Bottom",
    cube_front: "Front",
    cube_back: "Back",
    cube_left: "Left",
    cube_right: "Right",
    op_pick: "Select Model",
    op_clear: "Clear",
    tool_measure: "Measure",
    tool: "Tools",
    tool_clip: "Section",
    settings: "Settings",
    setting_general: "Preferences",
    interface_outline: "Structures",
    interface_props: "Properties",
    status_ready: "Ready",
    loading_resources: "Loading resources...",
    analyzing: "Analyzing...",
    reading: "Reading",
    success: "Operation Successful",
    failed: "Failed",
    processing: "Processing",
    no_selection: "No selection",
    no_models: "No model loaded",
    no_measurements: "No measurements",
    search_nodes: "Search nodes...",
    search_props: "Search properties...",
    expand_all: "Expand All",
    collapse_all: "Collapse All",
    isolate_selection: "Isolate Selection",
    clear_selection: "Clear Selection",
    ctx_show_all: "Show All",
    hide_selected: "Hide Selected",
    show_all: "Show All",
    ctx_hide_selection: "Hide Selection",
    monitor_meshes: "Mesh",
    monitor_faces: "Faces",
    monitor_mem: "Mem",
    monitor_calls: "Calls",
    selected_count: "Selected",
    tips_rotate: "LMB: Rotate",
    tips_pan: "MMB: Pan",
    tips_zoom: "Scroll: Zoom",
    confirm_delete: "Confirm delete",
    confirm_clear: "Are you sure you want to clear the scene?",
    app_title: "3D Browser - Professional Viewer",
    interface_display_short: "Display",
    view_perspective: "Perspective",
    view_ortho: "Orthographic",
    writing: "Writing files...",
    delete_item: "Delete Item",
    btn_confirm: "Confirm",
    btn_cancel: "Cancel",
    // 属性
    pg_basic: "Basic Information",
    pg_geo: "Geometry",
    prop_name: "Name",
    prop_id: "ID",
    prop_type: "Type",
    prop_pos: "Position",
    prop_dim: "Dimensions",
    prop_inst: "Instances",
    prop_vert: "Vertices",
    prop_tri: "Triangles",
    prop_area: "Area",
    prop_volume: "Volume",
    // 测量
    measure_title: "Measurement Tool",
    measure_type: "Type",
    measure_none: "None",
    measure_dist: "Distance",
    measure_angle: "Angle",
    measure_coord: "Coordinate",
    measure_instruct_dist: "Click 2 points to measure distance.",
    measure_instruct_angle: "Click 3 points (Start-Vertex-End).",
    measure_instruct_coord: "Click any point to get coordinates.",
    measure_clear: "Clear All",
    measure_start: "Start",
    measure_stop: "Stop",
    tb_boxSelect: "Box Select",
    tb_boxSelect_hint: "Drag to select objects",
    tb_wireframe: "Wireframe",
    op_screenshot: "Screenshot",
    // 渲染样式
    display_mode: "DisplayMode",
    dm_solid: "Solid",
    dm_transparent: "Transparent",
    dm_wireframe: "Wireframe",
    dm_solidwire: "Solid with Outline",
    dm_hidden: "Hidden Line",
    // 剖切
    clip_title: "Sectioning Tool",
    clip_enable: "Enable Clipping",
    clip_x: "X Axis",
    clip_y: "Y Axis",
    clip_z: "Z Axis",
    // 导出
    export_title: "Export Scene",
    export_format: "Format",
    export_glb: "GLB (Standard)",
    export_lmb: "LMB (Custom Compressed)",
    export_3dtiles: "3D Tiles (Web)",
    export_nbim: "NBIM (High Performance)",
    export_btn: "Export",
    // 设置
    st_lighting: "Lighting",
    st_ambient: "Ambient Int.",
    st_dir: "Direct Int.",
    st_render_mode: "Render Mode",
    st_render_standard: "Standard",
    st_render_mayo: "Mayo",
    st_render_blender: "Blender",
    st_sun_simulation: "Sun Simulation",
    st_sun_enabled: "Enable Sun",
    st_sun_latitude: "Latitude",
    st_sun_longitude: "Longitude",
    st_sun_time: "Time",
    st_sun_info: "Set location and time for realistic sunlight",
    st_sun_shadow: "Show Shadows",
    st_bg: "Background",
    st_lang: "Language",
    st_import_settings: "Import Settings",
    st_theme: "Theme",
    st_font_size: "Font Size",
    st_font_compact: "Compact",
    st_font_medium: "Medium",
    st_font_loose: "Loose",
    st_menu_mode: "Menu Mode",
    menu_mode_menu: "Menu",
    menu_mode_toolbar: "Toolbar",
    tb_file: "File",
    tb_folder: "Folder",
    tb_export: "Export",
    tb_clear: "Clear",
    tb_fit: "Fit",
    tb_view: "View",
    tb_model: "Model",
    tb_props: "Props",
    tb_pick: "Pick",
    tb_measure: "Measure",
    tb_clip: "Clip",
    tb_settings: "Setting",
    tb_about: "About",
    tb_sun: "Sun",
    st_monitor: "Performance Panel",
    st_adaptive_quality: "Adaptive Quality",
    st_exposure: "Exposure",
    st_tonemapping: "Tone Mapping",
    st_shadow_quality: "Shadow Quality",
    st_shadow_off: "Off",
    st_shadow_low: "Low",
    st_shadow_medium: "Medium",
    st_shadow_high: "High",
    st_instancing: "Instancing Render",
    st_viewport: "Viewport",
    st_viewcube_size: "ViewCube Size",
    st_frustum_culling: "Frustum Culling",
    unsupported_format: "Unsupported format",
    theme_dark: "Dark",
    theme_light: "Light",
    ready: "ready",
    all_chunks_loaded: "All model chunks loaded",
    loading_chunks: "Chunks",
    loading_cad_engine: "Loading CAD engine...",
    parsing_cad_data: "Parsing CAD data...",
    creating_geometry: "Creating geometry...",
    error_cad_parse_failed: "Failed to parse CAD file",
    model_loaded: "Model loaded",
    confirm_clear_title: "Clear Scene",
    confirm_clear_msg: "Are you sure you want to clear all models in the scene?",
    menu_about: "About",
    about_title: "About 3D Browser",
    about_author: "Author",
    project_url: "Project URL",
    about_license: "License",
    about_license_nc: "Non-commercial Use Only",
    license_details: "License Details",
    third_party_libs: "Third-party Libraries",
    license_summary: "This software is licensed under Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).\n\nKey terms:\n• Free for non-commercial use only\n• Commercial use is strictly prohibited\n• Attribution required\n• ShareAlike for adaptations (non-commercial)\n• No warranties or liability\n\nFor commercial licensing, contact: zhangly1403@163.com",
    third_party_desc: "This software uses the following open-source libraries:",
    view_package_json: "View full dependency list in package.json",
    full_license: "Full license:",
    error_title: "Application Error",
    error_msg: "Sorry, the application encountered an unexpected error. You can try reloading the page or contact the developer.",
    error_reload: "Reload Page",
    viewpoint_title: "Viewpoint Management",
    viewpoint_save: "Save Current Viewpoint",
    viewpoint_empty: "No saved viewpoints",
    viewpoint_loading: "Restoring viewpoint",
    chunk_loading: "Chunks",
    select_all: "Select All",
    invert_selection: "Invert Selection",
    set_opacity: "Opacity",
    copied: "Copied"
  },
  zh: {
    home: "首页",
    view_home: "主视图",
    menu_open_file: "打开文件",
    menu_open_folder: "打开目录",
    menu_open_url: "打开 URL",
    menu_batch_convert: "批量转换",
    menu_file: "文件",
    menu_export: "导出场景",
    interface_display: "界面",
    view: "视图",
    menu_fit_view: "充满视图",
    view_top: "顶视",
    view_bottom: "底视",
    view_front: "前视",
    view_back: "后视",
    view_left: "左视",
    view_right: "右视",
    view_se: "东南",
    view_sw: "西南",
    view_ne: "东北",
    view_nw: "西北",
    cube_top: "顶",
    cube_bottom: "底",
    cube_front: "前",
    cube_back: "后",
    cube_left: "左",
    cube_right: "右",
    op_pick: "选择模式",
    op_clear: "清空场景",
    tool: "工具",
    tool_measure: "测量工具",
    tool_clip: "剖切工具",
    settings: "设置",
    setting_general: "全局设置",
    interface_outline: "模型结构",
    interface_props: "对象属性",
    status_ready: "就绪",
    loading_resources: "正在加载资源...",
    analyzing: "正在分析...",
    reading: "读取",
    success: "操作成功",
    failed: "失败",
    processing: "处理中",
    no_selection: "未选择对象",
    no_models: "未加载模型",
    no_measurements: "无测量结果",
    search_nodes: "搜索节点...",
    search_props: "搜索属性...",
    expand_all: "全部展开",
    collapse_all: "全部折叠",
    isolate_selection: "隔离选择",
    clear_selection: "清空选择",
    ctx_show_all: "显示所有",
    hide_selected: "隐藏选中",
    show_all: "显示全部",
    ctx_hide_selection: "隐藏选择",
    monitor_meshes: "网格",
    monitor_faces: "面",
    monitor_mem: "显存",
    monitor_calls: "绘制",
    selected_count: "已选择",
    tips_rotate: "左键旋转",
    tips_pan: "中键平移",
    tips_zoom: "滚轮缩放",
    confirm_delete: "确定要删除吗？",
    confirm_clear: "确定要清空场景吗？",
    app_title: "3D Browser - 专业浏览器",
    interface_display_short: "显示",
    view_perspective: "透视",
    view_ortho: "正交",
    delete_item: "删除模型",
    btn_confirm: "确定",
    btn_cancel: "取消",
    // 属性
    pg_basic: "基本信息",
    pg_geo: "几何信息",
    prop_name: "名称",
    prop_id: "ID",
    prop_type: "类型",
    prop_pos: "位置",
    prop_dim: "尺寸",
    prop_inst: "实例数",
    prop_vert: "顶点数",
    prop_tri: "面数",
    prop_area: "面积",
    prop_volume: "体积",
    // 测量
    measure_title: "测量面板",
    measure_type: "测量类型",
    measure_none: "无",
    measure_dist: "长度",
    measure_angle: "角度",
    measure_coord: "坐标",
    measure_instruct_dist: "请在场景中点击两个点以测量距离。",
    measure_instruct_angle: "请点击三个点测量角度 (起点-顶点-终点)。",
    measure_instruct_coord: "点击任意位置获取世界坐标。",
    measure_clear: "清空测量",
    measure_start: "开始测量",
    measure_stop: "停止测量",
    tb_boxSelect: "框选",
    tb_boxSelect_hint: "拖拽选择对象",
    tb_wireframe: "线框",
    op_screenshot: "场景截图",
    // 渲染样式
    display_mode: "样式",
    dm_solid: "着色",
    dm_transparent: "透明",
    dm_wireframe: "线框",
    dm_solidwire: "着色带轮廓线",
    dm_hidden: "消隐",
    // 剖切
    clip_title: "剖切面板",
    clip_enable: "开启剖切",
    clip_x: "X 轴",
    clip_y: "Y 轴",
    clip_z: "Z 轴",
    // 导出
    export_title: "导出场景",
    export_format: "导出格式",
    export_glb: "GLB (标准通用)",
    export_lmb: "LMB (自定义压缩)",
    export_3dtiles: "3D Tiles (Web大模型)",
    export_nbim: "NBIM (高性能分块模型)",
    export_btn: "开始导出",
    // 设置
    st_lighting: "场景光照",
    st_ambient: "环境光强度",
    st_dir: "直射光强度",
    st_render_mode: "渲染模式",
    st_render_standard: "标准",
    st_render_mayo: "Mayo",
    st_render_blender: "Blender",
    st_sun_simulation: "光照模拟",
    st_sun_enabled: "启用太阳光",
    st_sun_latitude: "纬度",
    st_sun_longitude: "经度",
    st_sun_time: "时间",
    st_sun_info: "设置位置和时间以模拟真实光照效果",
    st_sun_shadow: "显示阴影",
    st_bg: "背景颜色",
    st_lang: "界面语言",
    st_import_settings: "导入设置",
    st_theme: "界面主题",
    st_font_size: "界面字号",
    st_font_compact: "紧凑",
    st_font_medium: "中等",
    st_font_loose: "宽松",
    st_menu_mode: "菜单模式",
    menu_mode_menu: "菜单",
    menu_mode_toolbar: "工具栏",
    tb_file: "文件",
    tb_folder: "目录",
    tb_export: "导出",
    tb_clear: "清空",
    tb_fit: "充满",
    tb_view: "视图",
    tb_model: "模型",
    tb_props: "属性",
    tb_pick: "选择",
    tb_measure: "测量",
    tb_clip: "剖切",
    tb_settings: "设置",
    tb_about: "关于",
    tb_sun: "光照",
    st_monitor: "性能面板",
    st_adaptive_quality: "自适应画质",
    st_exposure: "曝光",
    st_tonemapping: "色调映射",
    st_shadow_quality: "阴影质量",
    st_shadow_off: "关闭",
    st_shadow_low: "低",
    st_shadow_medium: "中",
    st_shadow_high: "高",
    st_instancing: "实例化渲染",
    st_viewport: "视口设置",
    st_viewcube_size: "导航方块大小",
    st_frustum_culling: "视锥体剔除",
    unsupported_format: "不支持的文件格式",
    theme_dark: "深色模式",
    theme_light: "浅色模式",
    ready: "就绪",
    all_chunks_loaded: "所有模型分片已加载",
    loading_chunks: "分片",
    loading_cad_engine: "正在加载 CAD 引擎...",
    parsing_cad_data: "正在解析 CAD 数据...",
    creating_geometry: "正在生成几何体...",
    error_cad_parse_failed: "CAD 文件解析失败",
    model_loaded: "模型加载完成",
    confirm_clear_title: "清空场景",
    confirm_clear_msg: "确定要清空场景中的所有模型吗？",
    menu_about: "关于",
    about_title: "关于 3D Browser",
    about_author: "作者",
    project_url: "项目地址",
    about_license: "授权协议",
    about_license_nc: "仅限非商业用途",
    license_details: "授权协议详情",
    third_party_libs: "第三方库",
    license_summary: "本软件采用知识共享署名-非商业性使用 4.0 国际许可协议 (CC BY-NC 4.0)。\n\n主要条款：\n• 仅限非商业用途免费使用\n• 禁止用于任何商业目的\n• 必须保留署名\n• 相同方式共享（非商业性改编）\n• 不提供任何担保或责任\n\n如需商业授权，请联系：zhangly1403@163.com",
    third_party_desc: "本软件使用了以下开源库：",
    view_package_json: "查看完整依赖列表请参考 package.json",
    full_license: "完整协议:",
    error_title: "应用发生错误",
    error_msg: "抱歉，程序运行过程中遇到了未预期的错误。您可以尝试重新加载页面，或联系开发人员。",
    error_reload: "重新加载页面",
    viewpoint_title: "视点管理",
    viewpoint_save: "保存当前视点",
    viewpoint_empty: "暂无保存的视点",
    viewpoint_loading: "恢复视点",
    chunk_loading: "分片加载",
    select_all: "全选",
    invert_selection: "反选",
    set_opacity: "透明度",
    copied: "已复制"
  }
};
const getTranslation = (lang, key) => {
  return resources[lang][key] || key;
};

const Button = ({
  children,
  variant = "default",
  active,
  theme,
  style,
  className = "",
  ...props
}) => {
  let btnClass = "ui-btn";
  if (variant === "primary") btnClass += " ui-btn-primary";
  else if (variant === "danger") btnClass += " bg-error text-white border-error";
  else if (variant === "ghost") btnClass += " ui-btn-ghost";
  else btnClass += " ui-btn-default";
  if (active) btnClass += " active";
  return /* @__PURE__ */ jsx("button", { className: `${btnClass} ${className}`, style, ...props, children });
};

const ImageButton = ({
  icon,
  label,
  active,
  theme,
  style,
  className = "",
  ...props
}) => {
  return /* @__PURE__ */ jsxs(
    "button",
    {
      style,
      className: `ui-toolbar-btn ${active ? "active" : ""} ${className}`,
      ...props,
      children: [
        /* @__PURE__ */ jsx("div", { className: "flex items-center justify-center w-[18px] h-[18px] overflow-hidden", children: icon }),
        label && /* @__PURE__ */ jsx("div", { className: "text-[10px] leading-none font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full mt-[2px]", children: label })
      ]
    }
  );
};

const Slider = ({
  min,
  max,
  step = 1,
  value,
  onChange,
  theme,
  disabled = false,
  style
}) => {
  const percentage = (value - min) / (max - min) * 100;
  const sliderRef = useRef(null);
  const calcValueFromX = useCallback((clientX) => {
    if (!sliderRef.current) return value;
    const rect = sliderRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newValue = min + percent * (max - min);
    return Math.round(newValue / step) * step;
  }, [min, max, step, value]);
  const handleMouseDown = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    const targetValue = calcValueFromX(e.clientX);
    onChange(Math.max(min, Math.min(max, targetValue)));
    const handleMouseMove = (moveEvent) => {
      const newValue = calcValueFromX(moveEvent.clientX);
      onChange(Math.max(min, Math.min(max, newValue)));
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [calcValueFromX, onChange, min, max, disabled]);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: sliderRef,
      className: "ui-slider",
      style: {
        opacity: disabled ? 0.5 : 1,
        width: "100%",
        minWidth: 0,
        height: "24px",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        ...style
      },
      onMouseDown: handleMouseDown,
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-slider-track",
            style: {
              position: "absolute",
              width: "100%",
              height: "6px",
              backgroundColor: "var(--border-color)",
              borderRadius: "3px"
            }
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-slider-progress",
            style: {
              position: "absolute",
              width: `${percentage}%`,
              height: "6px",
              backgroundColor: "var(--accent)",
              borderRadius: "3px"
            }
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-slider-thumb",
            style: {
              left: `${percentage}%`,
              width: "16px",
              height: "16px",
              backgroundColor: "var(--bg-primary)",
              border: `2px solid var(--accent)`,
              borderRadius: "50%",
              cursor: disabled ? "not-allowed" : "default",
              position: "absolute",
              transform: "translateX(-50%)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
            }
          }
        )
      ]
    }
  );
};

const DualSlider = ({
  min,
  max,
  value,
  onChange,
  theme,
  disabled = false,
  style
}) => {
  const sliderRef = useRef(null);
  const percentage1 = (value[0] - min) / (max - min) * 100;
  const percentage2 = (value[1] - min) / (max - min) * 100;
  const calcValueFromX = useCallback((clientX) => {
    if (!sliderRef.current) return min;
    const rect = sliderRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return min + percent * (max - min);
  }, [min, max]);
  const handleThumb1MouseDown = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const handleMouseMove = (moveEvent) => {
      const newValue = calcValueFromX(moveEvent.clientX);
      onChange([Math.max(min, Math.min(value[1] - 1, Math.round(newValue))), value[1]]);
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [disabled, calcValueFromX, onChange, min, value]);
  const handleThumb2MouseDown = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const handleMouseMove = (moveEvent) => {
      const newValue = calcValueFromX(moveEvent.clientX);
      onChange([value[0], Math.min(max, Math.max(value[0] + 1, Math.round(newValue)))]);
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [disabled, calcValueFromX, onChange, max, value]);
  const handleTrackClick = useCallback((e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const clickValue = calcValueFromX(e.clientX);
    const dist1 = Math.abs(clickValue - value[0]);
    const dist2 = Math.abs(clickValue - value[1]);
    if (dist1 <= dist2) {
      onChange([Math.max(min, Math.min(value[1] - 1, Math.round(clickValue))), value[1]]);
    } else {
      onChange([value[0], Math.min(max, Math.max(value[0] + 1, Math.round(clickValue)))]);
    }
  }, [disabled, calcValueFromX, onChange, min, max, value]);
  return /* @__PURE__ */ jsxs(
    "div",
    {
      ref: sliderRef,
      className: "ui-slider",
      style: {
        opacity: disabled ? 0.5 : 1,
        width: "100%",
        minWidth: 0,
        height: "24px",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        ...style
      },
      onClick: handleTrackClick,
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-slider-track",
            style: {
              position: "absolute",
              width: "100%",
              height: "6px",
              backgroundColor: "var(--border-color)",
              borderRadius: "3px"
            }
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-slider-progress",
            style: {
              position: "absolute",
              left: `${percentage1}%`,
              width: `${percentage2 - percentage1}%`,
              height: "6px",
              backgroundColor: "var(--accent)",
              borderRadius: "3px"
            }
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-slider-thumb",
            style: {
              left: `${percentage1}%`,
              width: "16px",
              height: "16px",
              backgroundColor: "var(--bg-primary)",
              border: `2px solid var(--accent)`,
              borderRadius: "50%",
              cursor: disabled ? "not-allowed" : "default",
              position: "absolute",
              transform: "translateX(-50%)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
            },
            onMouseDown: handleThumb1MouseDown
          }
        ),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-slider-thumb",
            style: {
              left: `${percentage2}%`,
              width: "16px",
              height: "16px",
              backgroundColor: "var(--bg-primary)",
              border: `2px solid var(--accent)`,
              borderRadius: "50%",
              cursor: disabled ? "not-allowed" : "default",
              position: "absolute",
              transform: "translateX(-50%)",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)"
            },
            onMouseDown: handleThumb2MouseDown
          }
        )
      ]
    }
  );
};

const Switch = ({ checked, onChange, disabled = false, className = "" }) => {
  return /* @__PURE__ */ jsx(
    "button",
    {
      className: `ui-switch ${checked ? "active" : ""} ${disabled ? "disabled" : ""} ${className}`,
      onClick: () => !disabled && onChange(!checked),
      role: "switch",
      "aria-checked": checked,
      disabled,
      children: /* @__PURE__ */ jsx("div", { className: "ui-switch-thumb" })
    }
  );
};

const SegmentedControl$1 = ({
  options,
  value,
  onChange,
  className = ""
}) => /* @__PURE__ */ jsx("div", { className: `ui-segmented ${className}`, children: options.map((option) => /* @__PURE__ */ jsxs(
  "button",
  {
    className: `ui-segmented-item ${value === option.value ? "active" : ""}`,
    onClick: () => onChange(option.value),
    children: [
      option.icon && /* @__PURE__ */ jsx("span", { children: option.icon }),
      /* @__PURE__ */ jsx("span", { children: option.label })
    ]
  },
  option.value
)) });

const Select = ({ value, options, onChange, className = "", style }) => /* @__PURE__ */ jsx(
  "select",
  {
    value,
    onChange: (e) => onChange(e.target.value),
    className: `ui-input ${className}`,
    style: {
      padding: "4px 28px 4px 8px",
      appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23A0A0A0' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat",
      backgroundPosition: "right 8px center",
      ...style
    },
    children: options.map((option) => /* @__PURE__ */ jsx("option", { value: option.value, children: option.label }, option.value))
  }
);

const Checkbox = ({
  label,
  checked,
  onChange,
  disabled = false,
  style,
  labelStyle
}) => {
  return /* @__PURE__ */ jsxs(
    "label",
    {
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        cursor: disabled ? "not-allowed" : "pointer",
        userSelect: "none",
        opacity: disabled ? 0.5 : 1,
        ...style
      },
      onClick: (e) => {
        if (disabled) return;
        e.preventDefault();
        onChange(!checked);
      },
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            style: {
              width: "14px",
              height: "14px",
              minWidth: "14px",
              minHeight: "14px",
              border: "1px solid var(--border-color)",
              borderRadius: "2px",
              backgroundColor: checked ? "var(--accent)" : "var(--bg-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "none",
              flexShrink: 0
            },
            children: checked && /* @__PURE__ */ jsx(
              "svg",
              {
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "white",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                style: { width: "10px", height: "10px" },
                children: /* @__PURE__ */ jsx("polyline", { points: "20 6 9 17 4 12" })
              }
            )
          }
        ),
        label && /* @__PURE__ */ jsx("span", { style: { fontSize: "12px", color: "var(--text-primary)", ...labelStyle }, children: label })
      ]
    }
  );
};

const iconSize = 24;
const iconStrokeWidth = 1.5;
const createIcon = (paths, props = {}) => {
  const { size, color, ...rest } = props;
  return /* @__PURE__ */ jsx(
    "svg",
    {
      width: size || iconSize,
      height: size || iconSize,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: color || "currentColor",
      strokeWidth: iconStrokeWidth,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      ...rest,
      children: paths
    }
  );
};
const IconChevronRight = (props) => createIcon(/* @__PURE__ */ jsx("polyline", { points: "9 18 15 12 9 6" }), props);
const IconChevronDown = (props) => createIcon(/* @__PURE__ */ jsx("polyline", { points: "6 9 12 15 18 9" }), props);
const IconChevronUp = (props) => createIcon(/* @__PURE__ */ jsx("polyline", { points: "18 15 12 9 6 15" }), props);
const IconClose = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    /* @__PURE__ */ jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
  ] }),
  props
);
const IconFile = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
    /* @__PURE__ */ jsx("polyline", { points: "14 2 14 8 20 8" })
  ] }),
  props
);
const IconMaximize = (props) => createIcon(
  /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("path", { d: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" }) }),
  props
);
const IconRuler = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("rect", { x: "2", y: "2", width: "20", height: "16", rx: "1" }),
    /* @__PURE__ */ jsx("line", { x1: "6", y1: "14", x2: "6", y2: "17" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "14", x2: "12", y2: "16" }),
    /* @__PURE__ */ jsx("line", { x1: "18", y1: "14", x2: "18", y2: "17" })
  ] }),
  props
);
const IconScissors = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "6", cy: "6", r: "3" }),
    /* @__PURE__ */ jsx("circle", { cx: "6", cy: "18", r: "3" }),
    /* @__PURE__ */ jsx("line", { x1: "20", y1: "4", x2: "8.12", y2: "15.88" }),
    /* @__PURE__ */ jsx("line", { x1: "14.47", y1: "14.48", x2: "20", y2: "20" }),
    /* @__PURE__ */ jsx("line", { x1: "8.12", y1: "8.12", x2: "12", y2: "12" })
  ] }),
  props
);
const IconSettings = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "3" }),
    /* @__PURE__ */ jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" })
  ] }),
  props
);
const IconInfo = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "10" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "16", x2: "12", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" })
  ] }),
  props
);
const IconMousePointer = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" }),
    /* @__PURE__ */ jsx("path", { d: "M13 13l6 6" })
  ] }),
  props
);
const IconBox = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" }),
    /* @__PURE__ */ jsx("polyline", { points: "3.27 6.96 12 12.01 20.73 6.96" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "22.08", x2: "12", y2: "12" })
  ] }),
  props
);
const IconList = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("line", { x1: "8", y1: "6", x2: "21", y2: "6" }),
    /* @__PURE__ */ jsx("line", { x1: "8", y1: "12", x2: "21", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "8", y1: "18", x2: "21", y2: "18" }),
    /* @__PURE__ */ jsx("line", { x1: "3", y1: "6", x2: "3.01", y2: "6" }),
    /* @__PURE__ */ jsx("line", { x1: "3", y1: "12", x2: "3.01", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "3", y1: "18", x2: "3.01", y2: "18" })
  ] }),
  props
);
const IconActivity = (props) => createIcon(
  /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("polyline", { points: "22 12 18 12 15 21 9 3 6 12 2 12" }) }),
  props
);
const IconCamera = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }),
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "13", r: "4" })
  ] }),
  props
);
const IconEye = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "3" })
  ] }),
  props
);
const IconSun = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "12", r: "5" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "1", x2: "12", y2: "3" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "21", x2: "12", y2: "23" }),
    /* @__PURE__ */ jsx("line", { x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" }),
    /* @__PURE__ */ jsx("line", { x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" }),
    /* @__PURE__ */ jsx("line", { x1: "1", y1: "12", x2: "3", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "21", y1: "12", x2: "23", y2: "12" }),
    /* @__PURE__ */ jsx("line", { x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" }),
    /* @__PURE__ */ jsx("line", { x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" })
  ] }),
  props
);
const IconMoon = (props) => createIcon(
  /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsx("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" }) }),
  props
);
const IconGrid = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("rect", { x: "3", y: "3", width: "7", height: "7" }),
    /* @__PURE__ */ jsx("rect", { x: "14", y: "3", width: "7", height: "7" }),
    /* @__PURE__ */ jsx("rect", { x: "14", y: "14", width: "7", height: "7" }),
    /* @__PURE__ */ jsx("rect", { x: "3", y: "14", width: "7", height: "7" })
  ] }),
  props
);
const IconLayers = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("polygon", { points: "12 2 2 7 12 12 22 7 12 2" }),
    /* @__PURE__ */ jsx("polyline", { points: "2 12 12 17 22 12" }),
    /* @__PURE__ */ jsx("polyline", { points: "2 17 12 22 22 17" })
  ] }),
  props
);
const IconSelectAll = (props) => createIcon(
  /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("path", { d: "M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4z", fill: "none" }),
    /* @__PURE__ */ jsx("line", { x1: "7", y1: "5", x2: "17", y2: "5" }),
    /* @__PURE__ */ jsx("line", { x1: "5", y1: "7", x2: "5", y2: "17" }),
    /* @__PURE__ */ jsx("line", { x1: "17", y1: "19", x2: "7", y2: "19" }),
    /* @__PURE__ */ jsx("line", { x1: "19", y1: "17", x2: "19", y2: "7" })
  ] }),
  props
);

const Toolbar = (props) => {
  const {
    t,
    theme,
    hiddenMenus = []
  } = props;
  const isHidden = (id) => (hiddenMenus || []).includes(id);
  const fileInputRef = React.useRef(null);
  const folderInputRef = React.useRef(null);
  const batchConvertInputRef = React.useRef(null);
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = React.useRef(null);
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const toggleMenu = (menuId) => {
    setOpenMenu(openMenu === menuId ? null : menuId);
  };
  const renderDropdown = (menuId, items) => {
    if (openMenu !== menuId) return null;
    return /* @__PURE__ */ jsx(
      "div",
      {
        ref: menuRef,
        style: {
          position: "absolute",
          top: "100%",
          left: 0,
          marginTop: "4px",
          backgroundColor: theme.panelBg,
          border: `1px solid ${theme.border}`,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          zIndex: 2e3,
          minWidth: "140px",
          padding: "4px 0"
        },
        children: items
      }
    );
  };
  return /* @__PURE__ */ jsxs("div", { className: "ui-toolbar", children: [
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "file",
        ref: fileInputRef,
        style: { display: "none" },
        multiple: true,
        accept: ".lmb,.lmbz,.glb,.gltf,.ifc,.nbim,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges",
        onChange: props.handleOpenFiles
      }
    ),
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "file",
        ref: batchConvertInputRef,
        style: { display: "none" },
        multiple: true,
        accept: ".lmb,.lmbz,.glb,.gltf,.ifc,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges",
        onChange: props.handleBatchConvert
      }
    ),
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "file",
        ref: folderInputRef,
        style: { display: "none" },
        ...{ webkitdirectory: "", directory: "" },
        accept: ".lmb,.lmbz,.glb,.gltf,.ifc,.nbim,.fbx,.obj,.stl,.ply,.3ds,.dae,.stp,.step,.igs,.iges",
        onChange: props.handleOpenFolder
      }
    ),
    !isHidden("file") && /* @__PURE__ */ jsx("div", { className: "ui-toolbar-group", children: /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
      /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconFile, {}),
          label: t("tb_file"),
          active: openMenu === "file",
          onClick: () => toggleMenu("file"),
          theme
        }
      ),
      renderDropdown("file", /* @__PURE__ */ jsxs(Fragment, { children: [
        !isHidden("open_file") && /* @__PURE__ */ jsx(
          "div",
          {
            style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
            onClick: () => {
              fileInputRef.current?.click();
              setOpenMenu(null);
            },
            onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
            onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
            children: t("menu_open_file")
          }
        ),
        !isHidden("open_folder") && /* @__PURE__ */ jsx(
          "div",
          {
            style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
            onClick: () => {
              folderInputRef.current?.click();
              setOpenMenu(null);
            },
            onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
            onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
            children: t("menu_open_folder")
          }
        ),
        !isHidden("export") && /* @__PURE__ */ jsx(
          "div",
          {
            style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
            onClick: () => {
              props.setActiveTool?.("export");
              setOpenMenu(null);
            },
            onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
            onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
            children: t("menu_export")
          }
        ),
        !isHidden("clear") && /* @__PURE__ */ jsx(
          "div",
          {
            style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
            onClick: () => {
              props.handleClear?.();
              setOpenMenu(null);
            },
            onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
            onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
            children: t("op_clear")
          }
        ),
        !isHidden("screenshot") && /* @__PURE__ */ jsx(
          "div",
          {
            style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
            onClick: () => {
              props.handleScreenshot?.();
              setOpenMenu(null);
            },
            onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
            onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
            children: t("op_screenshot") || "截图"
          }
        )
      ] }))
    ] }) }),
    !isHidden("view") && /* @__PURE__ */ jsxs("div", { className: "ui-toolbar-group", children: [
      /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconMaximize, {}),
          label: t("tb_fit"),
          onClick: () => props.sceneMgr?.fitView(),
          theme
        }
      ),
      /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
        /* @__PURE__ */ jsx(
          ImageButton,
          {
            icon: /* @__PURE__ */ jsx(IconEye, {}),
            label: t("tb_view"),
            active: openMenu === "views",
            onClick: () => toggleMenu("views"),
            theme
          }
        ),
        renderDropdown("views", /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("front");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_front")
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("back");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_back")
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("top");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_top")
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("bottom");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_bottom")
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("left");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_left")
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("right");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_right")
            }
          ),
          /* @__PURE__ */ jsx("div", { style: { height: "1px", backgroundColor: theme.border, margin: "4px 0" } }),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("se");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_se")
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("sw");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_sw")
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("ne");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_ne")
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: { padding: "6px 16px", fontSize: "12px", color: theme.text, cursor: "pointer", backgroundColor: "transparent" },
              onClick: () => {
                props.handleView?.("nw");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
              children: t("view_nw")
            }
          )
        ] }))
      ] })
    ] }),
    !isHidden("interface") && /* @__PURE__ */ jsxs("div", { className: "ui-toolbar-group", children: [
      !isHidden("wireframe") && /* @__PURE__ */ jsxs("div", { style: { position: "relative" }, children: [
        /* @__PURE__ */ jsx(
          ImageButton,
          {
            icon: /* @__PURE__ */ jsx(IconLayers, {}),
            label: t("display_mode") || "样式",
            active: openMenu === "displayMode",
            onClick: () => toggleMenu("displayMode"),
            theme
          }
        ),
        renderDropdown("displayMode", /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(
            "div",
            {
              style: {
                padding: "6px 16px",
                fontSize: "12px",
                color: props.displayMode === "solid" ? theme.accent : theme.text,
                cursor: "pointer",
                backgroundColor: props.displayMode === "solid" ? theme.itemHover : "transparent",
                fontWeight: props.displayMode === "solid" ? "600" : "400"
              },
              onClick: () => {
                props.handleDisplayModeChange?.("solid");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = props.displayMode === "solid" ? theme.itemHover : "transparent",
              children: t("dm_solid") || "着色"
            }
          ),
          /* @__PURE__ */ jsx(
            "div",
            {
              style: {
                padding: "6px 16px",
                fontSize: "12px",
                color: props.displayMode === "transparent" ? theme.accent : theme.text,
                cursor: "pointer",
                backgroundColor: props.displayMode === "transparent" ? theme.itemHover : "transparent",
                fontWeight: props.displayMode === "transparent" ? "600" : "400"
              },
              onClick: () => {
                props.handleDisplayModeChange?.("transparent");
                setOpenMenu(null);
              },
              onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
              onMouseLeave: (e) => e.currentTarget.style.backgroundColor = props.displayMode === "transparent" ? theme.itemHover : "transparent",
              children: t("dm_transparent") || "透明"
            }
          )
        ] }))
      ] }),
      !isHidden("outline") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconBox, {}),
          label: t("tb_model"),
          active: props.showOutline,
          onClick: () => props.setShowOutline?.(!props.showOutline),
          theme
        }
      ),
      !isHidden("props") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconList, {}),
          label: t("tb_props"),
          active: props.showProps,
          onClick: () => props.setShowProps?.(!props.showProps),
          theme
        }
      ),
      !isHidden("pick") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconMousePointer, {}),
          label: t("tb_pick"),
          active: props.pickEnabled,
          onClick: () => props.setPickEnabled?.(!props.pickEnabled),
          theme
        }
      )
    ] }),
    !isHidden("tool") && /* @__PURE__ */ jsxs("div", { className: "ui-toolbar-group", children: [
      !isHidden("measure") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconRuler, {}),
          label: t("tb_measure"),
          active: props.activeTool === "measure",
          onClick: () => props.setActiveTool?.(props.activeTool === "measure" ? "none" : "measure"),
          theme
        }
      ),
      !isHidden("boxSelect") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconSelectAll, {}),
          label: t("tb_boxSelect"),
          active: props.activeTool === "boxSelect",
          onClick: () => props.setActiveTool?.(props.activeTool === "boxSelect" ? "none" : "boxSelect"),
          theme
        }
      ),
      !isHidden("clip") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconScissors, {}),
          label: t("tb_clip"),
          active: props.activeTool === "clip",
          onClick: () => props.setActiveTool?.(props.activeTool === "clip" ? "none" : "clip"),
          theme
        }
      ),
      !isHidden("viewpoint") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconCamera, {}),
          label: t("tb_view"),
          active: props.activeTool === "viewpoint",
          onClick: () => props.setActiveTool?.(props.activeTool === "viewpoint" ? "none" : "viewpoint"),
          theme
        }
      ),
      !isHidden("sun") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconSun, {}),
          label: t("tb_sun"),
          active: props.activeTool === "sun",
          onClick: () => props.setActiveTool?.(props.activeTool === "sun" ? "none" : "sun"),
          theme
        }
      )
    ] }),
    !isHidden("about") && /* @__PURE__ */ jsxs("div", { className: "ui-toolbar-group", children: [
      !isHidden("settings") && /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconSettings, {}),
          label: t("tb_settings"),
          active: props.activeTool === "settings",
          onClick: () => props.setActiveTool?.(props.activeTool === "settings" ? "none" : "settings"),
          theme
        }
      ),
      /* @__PURE__ */ jsx(
        ImageButton,
        {
          icon: /* @__PURE__ */ jsx(IconInfo, {}),
          label: t("tb_about"),
          onClick: () => props.onOpenAbout?.(),
          theme
        }
      )
    ] })
  ] });
};

const flattenTree = (nodes, result = [], parentIsLast = []) => {
  if (!nodes) return result;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    node.isLastChild = i === nodes.length - 1;
    node.parentIsLast = [...parentIsLast];
    result.push(node);
    if (node.expanded && node.children && node.children.length > 0) {
      flattenTree(node.children, result, [...parentIsLast, node.isLastChild]);
    }
  }
  return result;
};
const SceneTree = ({
  t,
  treeRoot,
  setTreeRoot,
  selectedUuid,
  onSelect,
  onToggleVisibility,
  onDelete,
  onFocus
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredUuid, setHoveredUuid] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [menuHover, setMenuHover] = useState(null);
  const expandAll = () => {
    const expand = (nodes) => {
      return nodes.map((n) => ({
        ...n,
        expanded: n.children.length > 0,
        children: expand(n.children)
      }));
    };
    setTreeRoot((prev) => expand(prev));
  };
  const collapseAll = () => {
    const collapse = (nodes) => {
      return nodes.map((n) => ({
        ...n,
        expanded: false,
        children: collapse(n.children)
      }));
    };
    setTreeRoot((prev) => collapse(prev));
  };
  const handleContextMenu = (e, node) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);
  const filterTree = (nodes, query) => {
    if (!query) return nodes;
    const lowercaseQuery = query.toLowerCase();
    return nodes.reduce((acc, node) => {
      const matches = node.name.toLowerCase().includes(lowercaseQuery);
      const filteredChildren = filterTree(node.children, query);
      if (matches || filteredChildren.length > 0) {
        acc.push({
          ...node,
          expanded: query ? true : node.expanded,
          // 搜索时自动展开
          children: filteredChildren
        });
      }
      return acc;
    }, []);
  };
  const filteredTree = useMemo(() => filterTree(treeRoot, searchQuery), [treeRoot, searchQuery]);
  const flatData = useMemo(() => flattenTree(filteredTree), [filteredTree]);
  const rowHeight = 24;
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef(null);
  const [containerHeight, setContainerHeight] = useState(400);
  useEffect(() => {
    if (containerRef.current) {
      const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) setContainerHeight(entry.contentRect.height);
      });
      resizeObserver.observe(containerRef.current);
      return () => resizeObserver.disconnect();
    }
  }, []);
  const toggleNode = (nodeUuid) => {
    const toggle = (nodes) => {
      return nodes.map((n) => {
        if (n.uuid === nodeUuid) return { ...n, expanded: !n.expanded };
        if (n.children.length > 0) return { ...n, children: toggle(n.children) };
        return n;
      });
    };
    setTreeRoot((prev) => toggle(prev));
  };
  const totalHeight = flatData.length * rowHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight));
  const visibleCount = Math.ceil(containerHeight / rowHeight);
  const endIndex = Math.min(flatData.length, startIndex + visibleCount + 1);
  const visibleItems = flatData.slice(startIndex, endIndex);
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }, children: [
    /* @__PURE__ */ jsx("div", { style: { padding: "8px", borderBottom: "1px solid var(--border-color)" }, children: /* @__PURE__ */ jsxs("div", { style: { position: "relative", display: "flex", alignItems: "center" }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          type: "text",
          placeholder: t("search_nodes"),
          value: searchQuery,
          onChange: (e) => setSearchQuery(e.target.value),
          className: "ui-input",
          style: {
            width: "100%",
            padding: "4px 28px 4px 8px",
            borderRadius: "0px",
            boxSizing: "border-box"
          }
        }
      ),
      searchQuery && /* @__PURE__ */ jsx(
        "div",
        {
          onClick: () => setSearchQuery(""),
          style: {
            position: "absolute",
            right: 4,
            cursor: "pointer",
            opacity: 0.6,
            display: "flex",
            padding: 2
          },
          onMouseEnter: (e) => e.currentTarget.style.opacity = "1",
          onMouseLeave: (e) => e.currentTarget.style.opacity = "0.6",
          children: /* @__PURE__ */ jsx(IconClose, { width: 14, height: 14 })
        }
      )
    ] }) }),
    /* @__PURE__ */ jsx("div", { ref: containerRef, className: "ui-tree-container flex-1 overflow-y-auto overflow-x-hidden py-[2px]", onScroll: (e) => setScrollTop(e.currentTarget.scrollTop), children: /* @__PURE__ */ jsx("div", { style: { height: totalHeight, position: "relative" }, children: /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: startIndex * rowHeight, left: 0, right: 0 }, children: visibleItems.map((node) => /* @__PURE__ */ jsxs(
      "div",
      {
        className: `ui-tree-node ${node.uuid === selectedUuid ? "selected" : ""}`,
        style: { paddingLeft: 8 },
        onClick: () => onSelect(node.uuid, node.object),
        onDoubleClick: () => onFocus?.(node.object),
        onMouseEnter: () => setHoveredUuid(node.uuid),
        onMouseLeave: () => setHoveredUuid(null),
        onContextMenu: (e) => handleContextMenu(e, node),
        children: [
          node.depth > 0 && /* @__PURE__ */ jsxs("div", { style: { display: "flex", height: "100%", alignItems: "center", flexShrink: 0 }, children: [
            node.parentIsLast?.map((isLast, i) => /* @__PURE__ */ jsx("div", { style: {
              width: 12,
              height: "100%",
              position: "relative",
              borderLeft: isLast ? "none" : `1px solid var(--border-color)`
            } }, i)),
            /* @__PURE__ */ jsxs("div", { style: {
              width: 12,
              height: "100%",
              position: "relative",
              display: "flex",
              alignItems: "center"
            }, children: [
              /* @__PURE__ */ jsx("div", { style: {
                position: "absolute",
                left: 0,
                top: 0,
                bottom: node.isLastChild ? "50%" : 0,
                borderLeft: `1px solid var(--border-color)`
              } }),
              /* @__PURE__ */ jsx("div", { style: {
                position: "absolute",
                left: 0,
                width: 10,
                borderTop: `1px solid var(--border-color)`
              } })
            ] })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "ui-tree-expander", onClick: (e) => {
            e.stopPropagation();
            toggleNode(node.uuid);
          }, children: node.children.length > 0 ? node.expanded ? /* @__PURE__ */ jsx(IconChevronDown, { size: 12 }) : /* @__PURE__ */ jsx(IconChevronRight, { size: 12 }) : null }),
          /* @__PURE__ */ jsx(
            Checkbox,
            {
              checked: node.visible,
              onChange: (val) => onToggleVisibility(node.uuid, val),
              style: { marginRight: 4, padding: 0, flexShrink: 0 }
            }
          ),
          /* @__PURE__ */ jsx("div", { className: "ui-tree-label", children: searchQuery ? node.name.toLowerCase().includes(searchQuery.toLowerCase()) ? /* @__PURE__ */ jsx("span", { children: node.name.split(new RegExp(`(${searchQuery})`, "gi")).map(
            (part, i) => part.toLowerCase() === searchQuery.toLowerCase() ? /* @__PURE__ */ jsx("span", { style: { backgroundColor: "rgba(255, 255, 0, 0.4)", color: "inherit" }, children: part }, i) : part
          ) }) : node.name : node.name })
        ]
      },
      node.uuid
    )) }) }) }),
    contextMenu && /* @__PURE__ */ jsxs("div", { className: "ui-context-menu", style: { left: contextMenu.x, top: contextMenu.y }, children: [
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "ui-context-menu-item",
          onClick: () => {
            expandAll();
            setContextMenu(null);
          },
          children: t("expand_all")
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "ui-context-menu-item",
          onClick: () => {
            collapseAll();
            setContextMenu(null);
          },
          children: t("collapse_all")
        }
      ),
      contextMenu.node.isFileNode && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("div", { className: "ui-context-menu-divider" }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-context-menu-item",
            onClick: () => {
              onDelete?.(contextMenu.node.object);
              setContextMenu(null);
            },
            children: t("delete_item")
          }
        )
      ] })
    ] })
  ] });
};

const FloatingPanel = ({
  title,
  onClose,
  children,
  width = 300,
  height = 200,
  x = 100,
  y = 100,
  resizable = false,
  movable = true,
  storageId,
  modal = false
  // 默认非模态模式
}) => {
  const panelRef = useRef(null);
  const minWidth = storageId === "tool_measure" ? 320 : 220;
  const minHeight = storageId === "tool_measure" ? 400 : 120;
  const [pos, setPos] = useState(() => {
    if (modal) {
      return { x: (window.innerWidth - width) / 2, y: (window.innerHeight - height) / 2 };
    }
    if (storageId) {
      try {
        const saved = localStorage.getItem(`panel_${storageId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.pos && typeof parsed.pos.x === "number" && typeof parsed.pos.y === "number") {
            const loadedX = Math.min(Math.max(0, parsed.pos.x), window.innerWidth - 50);
            const loadedY = Math.min(Math.max(0, parsed.pos.y), window.innerHeight - 50);
            return { x: loadedX, y: loadedY };
          }
        }
      } catch (e) {
        console.error("Failed to load panel state", e);
      }
    }
    if (x === 100 && y === 100 && !storageId) {
      const centerX = (window.innerWidth - width) / 2;
      const centerY = (window.innerHeight - height) / 2;
      return { x: Math.max(0, centerX), y: Math.max(0, centerY) };
    }
    return { x, y };
  });
  const [size, setSize] = useState(() => {
    if (storageId && resizable) {
      try {
        const saved = localStorage.getItem(`panel_${storageId}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.size && typeof parsed.size.w === "number" && typeof parsed.size.h === "number") {
            return {
              w: Math.max(minWidth, parsed.size.w),
              h: Math.max(minHeight, parsed.size.h)
            };
          }
        }
      } catch (e) {
      }
    }
    return { w: width, h: height };
  });
  useEffect(() => {
    if (!modal) return;
    const centerPanel = () => {
      const centerX = (window.innerWidth - size.w) / 2;
      const centerY = (window.innerHeight - size.h) / 2;
      setPos({ x: Math.max(0, centerX), y: Math.max(0, centerY) });
    };
    window.addEventListener("resize", centerPanel);
    centerPanel();
    return () => {
      window.removeEventListener("resize", centerPanel);
    };
  }, [modal, size.w, size.h]);
  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const startSize = useRef({ w: 0, h: 0 });
  const currentPosRef = useRef(pos);
  const currentSizeRef = useRef(size);
  const animationFrame = useRef(0);
  useEffect(() => {
    currentPosRef.current = pos;
  }, [pos]);
  useEffect(() => {
    currentSizeRef.current = size;
  }, [size]);
  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current && !isResizing.current) return;
    e.preventDefault();
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = requestAnimationFrame(() => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (isDragging.current) {
        let newX = startPos.current.x + dx;
        let newY = startPos.current.y + dy;
        let limitW = window.innerWidth;
        let limitH = window.innerHeight;
        if (panelRef.current?.parentElement) {
          limitW = panelRef.current.parentElement.clientWidth;
          limitH = panelRef.current.parentElement.clientHeight;
        }
        const maxX = limitW - size.w;
        const maxY = limitH - size.h;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));
        setPos({ x: newX, y: newY });
      } else if (isResizing.current) {
        setSize({
          w: Math.max(minWidth, startSize.current.w + dx),
          h: Math.max(minHeight, startSize.current.h + dy)
        });
      }
    });
  }, [size, minWidth, minHeight]);
  const handleMouseUp = useCallback(() => {
    if ((isDragging.current || isResizing.current) && storageId) {
      try {
        const stateToSave = {
          pos: currentPosRef.current,
          size: currentSizeRef.current
        };
        localStorage.setItem(`panel_${storageId}`, JSON.stringify(stateToSave));
      } catch (e) {
        console.error("Failed to save panel state", e);
      }
    }
    isDragging.current = false;
    isResizing.current = false;
    if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
  }, [storageId]);
  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      if (animationFrame.current) cancelAnimationFrame(animationFrame.current);
    };
  }, [handleMouseMove, handleMouseUp]);
  const onHeaderDown = (e) => {
    if (modal || e.button !== 0 || !movable) return;
    e.preventDefault();
    e.stopPropagation();
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    startPos.current = { ...pos };
  };
  const onResizeDown = (e) => {
    if (modal || e.button !== 0 || !resizable) return;
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    startSize.current = { ...size };
  };
  const onCloseClick = (e) => {
    e.stopPropagation();
    onClose?.();
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    modal && /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          zIndex: 1999
        }
      }
    ),
    /* @__PURE__ */ jsxs(
      "div",
      {
        ref: panelRef,
        className: "ui-panel",
        style: {
          position: modal ? "fixed" : "absolute",
          left: pos.x,
          top: pos.y,
          width: size.w,
          height: size.h,
          zIndex: modal ? 2e3 : 200
        },
        children: [
          /* @__PURE__ */ jsxs(
            "div",
            {
              className: "ui-panel-header",
              onMouseDown: onHeaderDown,
              children: [
                /* @__PURE__ */ jsx("span", { className: "ui-panel-title", children: title }),
                onClose && /* @__PURE__ */ jsx(
                  "button",
                  {
                    className: "ui-panel-close",
                    onClick: onCloseClick,
                    title: "Close",
                    children: /* @__PURE__ */ jsx(IconClose, { width: 14, height: 14 })
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ jsx("div", { className: "ui-panel-content", children }),
          resizable && !modal && /* @__PURE__ */ jsx(
            "div",
            {
              className: "ui-panel-resize cursor-se-resize",
              onMouseDown: onResizeDown
            }
          )
        ]
      }
    )
  ] });
};

const Section = ({ title, children }) => /* @__PURE__ */ jsxs("div", { className: "mb-4", children: [
  /* @__PURE__ */ jsx(
    "div",
    {
      className: "text-xs font-semibold uppercase",
      style: {
        marginBottom: "10px",
        paddingBottom: "6px",
        color: "var(--text-secondary)",
        borderBottom: "1px solid var(--border-color)",
        letterSpacing: "0.5px"
      },
      children: title
    }
  ),
  children
] });
const Row = ({ label, children, labelWidth = "80px", stretch = false }) => /* @__PURE__ */ jsxs(
  "div",
  {
    className: "flex items-center justify-between",
    style: { marginBottom: "10px", minHeight: "28px", gap: "16px" },
    children: [
      /* @__PURE__ */ jsx(
        "span",
        {
          className: "text-sm text-secondary flex-shrink-0",
          style: {
            minWidth: labelWidth
          },
          children: label
        }
      ),
      /* @__PURE__ */ jsx(
        "div",
        {
          className: "flex items-center",
          style: {
            flex: stretch ? 1 : "0 1 auto",
            // stretch时flex:1，否则不伸缩
            justifyContent: stretch ? "flex-start" : "flex-end",
            minWidth: stretch ? 0 : void 0
            // stretch时允许缩小
          },
          children
        }
      )
    ]
  }
);
const SettingsPanel = ({
  t,
  // 翻译函数
  onClose,
  // 关闭回调
  settings,
  // 场景设置
  onUpdate,
  // 设置更新回调
  currentLang,
  // 当前语言
  setLang,
  // 设置语言回调
  themeMode,
  // 主题模式
  setThemeMode,
  // 设置主题回调
  showStats,
  // 是否显示统计
  setShowStats,
  // 设置统计显示回调
  // 样式配置
  theme
  // 主题配置
}) => {
  return /* @__PURE__ */ jsx(
    FloatingPanel,
    {
      title: t("settings"),
      onClose,
      width: 360,
      height: 500,
      modal: true,
      theme,
      children: /* @__PURE__ */ jsxs("div", { style: { padding: "12px", display: "flex", flexDirection: "column", gap: "8px", height: "100%", overflowY: "auto" }, children: [
        /* @__PURE__ */ jsxs(Section, { title: t("setting_general"), children: [
          /* @__PURE__ */ jsx(Row, { label: t("st_theme"), labelWidth: "70px", children: /* @__PURE__ */ jsx("div", { style: { flex: 1, display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ jsx(
            SegmentedControl$1,
            {
              options: [
                { value: "light", label: t("theme_light") || "Light" },
                { value: "dark", label: t("theme_dark") || "Dark" }
              ],
              value: themeMode,
              onChange: (v) => setThemeMode(v)
            }
          ) }) }),
          /* @__PURE__ */ jsx(Row, { label: t("st_lang"), labelWidth: "70px", stretch: true, children: /* @__PURE__ */ jsx(
            Select,
            {
              value: currentLang,
              options: [
                { value: "zh", label: "简体中文" },
                { value: "en", label: "English" }
              ],
              onChange: (v) => setLang(v)
            }
          ) }),
          /* @__PURE__ */ jsx(Row, { label: t("st_monitor"), labelWidth: "70px", children: /* @__PURE__ */ jsx(
            Switch,
            {
              checked: showStats,
              onChange: (v) => setShowStats(v)
            }
          ) }),
          /* @__PURE__ */ jsx(Row, { label: t("st_font_size"), labelWidth: "70px", children: /* @__PURE__ */ jsx("div", { style: { flex: 1, display: "flex", justifyContent: "flex-end" }, children: /* @__PURE__ */ jsx(
            SegmentedControl$1,
            {
              options: [
                { value: "compact", label: t("st_font_compact") || "紧凑" },
                { value: "medium", label: t("st_font_medium") || "中等" },
                { value: "loose", label: t("st_font_loose") || "宽松" }
              ],
              value: settings.fontSize || "medium",
              onChange: (v) => onUpdate({ fontSize: v })
            }
          ) }) })
        ] }),
        /* @__PURE__ */ jsxs(Section, { title: t("st_viewport"), children: [
          /* @__PURE__ */ jsx(Row, { label: t("st_viewcube_size"), labelWidth: "90px", stretch: true, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "12px", width: "100%" }, children: [
            /* @__PURE__ */ jsx("div", { style: { flex: 1, minWidth: 0 }, children: /* @__PURE__ */ jsx(
              Slider,
              {
                min: 60,
                max: 180,
                step: 5,
                value: settings.viewCubeSize || 100,
                onChange: (value) => onUpdate({ viewCubeSize: value })
              }
            ) }),
            /* @__PURE__ */ jsxs("div", { style: { color: "var(--text-secondary)", fontSize: "12px", minWidth: "44px", textAlign: "right" }, children: [
              settings.viewCubeSize || 100,
              "px"
            ] })
          ] }) }),
          /* @__PURE__ */ jsx(Row, { label: t("st_adaptive_quality") || "Adaptive", labelWidth: "90px", children: /* @__PURE__ */ jsx(
            Switch,
            {
              checked: settings.adaptiveQuality !== false,
              onChange: (v) => onUpdate({ adaptiveQuality: v })
            }
          ) })
        ] })
      ] })
    }
  );
};

const Icons = {
  Trash: () => /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: /* @__PURE__ */ jsx("path", { d: "M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9", strokeLinecap: "round", strokeLinejoin: "round" }) }),
  Distance: () => /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: /* @__PURE__ */ jsx("path", { d: "M2 8h12M8 4l4 4-4 4", strokeLinecap: "round", strokeLinejoin: "round" }) }),
  Angle: () => /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: /* @__PURE__ */ jsx("path", { d: "M2 14L14 14M2 14l3.5-12 6 8", strokeLinecap: "round", strokeLinejoin: "round" }) }),
  Coordinate: () => /* @__PURE__ */ jsxs("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
    /* @__PURE__ */ jsx("circle", { cx: "8", cy: "8", r: "6" }),
    /* @__PURE__ */ jsx("path", { d: "M8 2v12M2 8h12", strokeLinecap: "round" })
  ] }),
  None: () => /* @__PURE__ */ jsxs("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: [
    /* @__PURE__ */ jsx("circle", { cx: "8", cy: "8", r: "6" }),
    /* @__PURE__ */ jsx("path", { d: "M5 5l6 6M11 5l-6 6", strokeLinecap: "round" })
  ] }),
  Close: () => /* @__PURE__ */ jsx("svg", { width: "12", height: "12", viewBox: "0 0 14 14", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: /* @__PURE__ */ jsx("path", { d: "M2 2L12 12M12 2L2 12", strokeLinecap: "round" }) })
};
const SegmentedControl = ({ options, value, onChange }) => {
  return /* @__PURE__ */ jsx("div", { className: "ui-segmented", children: options.map((option) => /* @__PURE__ */ jsx(
    "button",
    {
      className: `ui-segmented-item ${value === option.value ? "active" : ""}`,
      onClick: () => onChange(option.value),
      children: /* @__PURE__ */ jsx("span", { children: option.label })
    },
    option.value
  )) });
};
const ClearButton = ({ onClick, disabled }) => {
  return /* @__PURE__ */ jsx(
    "button",
    {
      onClick,
      disabled,
      className: `ui-btn ui-btn-icon ui-btn-ghost ${disabled ? "disabled" : ""}`,
      title: "Clear All",
      children: /* @__PURE__ */ jsx(Icons.Trash, {})
    }
  );
};
const DataPanel = ({ children, empty, emptyText }) => {
  return /* @__PURE__ */ jsx("div", { className: "ui-data-panel flex flex-col", children: empty ? /* @__PURE__ */ jsx("div", { className: "flex flex-col items-center justify-center", style: { flex: 1, minHeight: "100px" }, children: /* @__PURE__ */ jsx("span", { className: "text-secondary text-sm", children: emptyText }) }) : children });
};
const MeasureItem = ({ item, isHighlighted, onHighlight, onDelete }) => {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      onClick: onHighlight,
      className: `ui-list-item ${isHighlighted ? "selected" : ""}`,
      style: {
        padding: "6px 10px",
        minHeight: "30px"
      },
      children: [
        /* @__PURE__ */ jsx(
          "span",
          {
            style: {
              fontSize: "12px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1
            },
            children: item.val
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              onDelete();
            },
            className: "ui-btn ui-btn-icon-sm ui-btn-ghost",
            style: { opacity: 0.6, marginLeft: "8px" },
            onMouseEnter: (e) => e.currentTarget.style.opacity = "1",
            onMouseLeave: (e) => e.currentTarget.style.opacity = "0.6",
            children: /* @__PURE__ */ jsx(Icons.Close, {})
          }
        )
      ]
    }
  );
};
const TypeHeader = ({ label }) => {
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "ui-group-title",
      style: {
        padding: "4px 10px",
        fontSize: "10px"
      },
      children: label
    }
  );
};
const MeasurePanel = ({
  t,
  sceneMgr,
  measureType,
  setMeasureType,
  measureHistory,
  onDelete,
  onClear,
  onClose,
  highlightedId,
  onHighlight
}) => {
  const groupedHistory = useMemo(() => {
    const groups = {
      "dist": [],
      "angle": [],
      "coord": []
    };
    measureHistory.forEach((item) => {
      if (groups[item.type]) groups[item.type].push(item);
    });
    return groups;
  }, [measureHistory]);
  const handleTypeChange = (type) => {
    setMeasureType(type);
    sceneMgr?.startMeasurement(type);
  };
  const measureOptions = [
    { value: "none", label: t("measure_none") || "None", icon: /* @__PURE__ */ jsx(Icons.None, {}) },
    { value: "dist", label: t("measure_dist") || "Distance", icon: /* @__PURE__ */ jsx(Icons.Distance, {}) },
    { value: "angle", label: t("measure_angle") || "Angle", icon: /* @__PURE__ */ jsx(Icons.Angle, {}) },
    { value: "coord", label: t("measure_coord") || "Coord", icon: /* @__PURE__ */ jsx(Icons.Coordinate, {}) }
  ];
  const getInstructionText = () => {
    switch (measureType) {
      case "dist":
        return t("measure_instruct_dist");
      case "angle":
        return t("measure_instruct_angle");
      case "coord":
        return t("measure_instruct_coord");
      default:
        return "";
    }
  };
  const getTypeLabel = (type) => {
    switch (type) {
      case "dist":
        return t("measure_dist") || "Distance";
      case "angle":
        return t("measure_angle") || "Angle";
      case "coord":
        return t("measure_coord") || "Coordinate";
      default:
        return type;
    }
  };
  return /* @__PURE__ */ jsx(
    FloatingPanel,
    {
      title: t("measure_title"),
      onClose,
      width: 300,
      height: 400,
      resizable: true,
      storageId: "tool_measure",
      children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col p-3", style: { height: "100%", gap: "10px" }, children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx(
            SegmentedControl,
            {
              options: measureOptions,
              value: measureType,
              onChange: handleTypeChange
            }
          ),
          /* @__PURE__ */ jsx(ClearButton, { onClick: onClear, disabled: measureHistory.length === 0 })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2 text-sm text-secondary", children: [
          /* @__PURE__ */ jsx("span", { children: getInstructionText() }),
          measureType !== "none" && /* @__PURE__ */ jsx("span", { className: "ml-auto font-medium text-secondary", children: "[ESC] Exit" })
        ] }),
        /* @__PURE__ */ jsx(DataPanel, { empty: measureHistory.length === 0, emptyText: t("no_measurements") || "No measurements", children: measureHistory.length > 0 && /* @__PURE__ */ jsx("div", { className: "flex flex-col", style: { overflow: "auto" }, children: Object.entries(groupedHistory).map(([type, items]) => {
          if (items.length === 0) return null;
          return /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(TypeHeader, { label: getTypeLabel(type) }),
            items.map((item) => /* @__PURE__ */ jsx(
              MeasureItem,
              {
                item,
                isHighlighted: highlightedId === item.id,
                onHighlight: () => onHighlight?.(item.id),
                onDelete: () => onDelete(item.id)
              },
              item.id
            ))
          ] }, type);
        }) }) })
      ] })
    }
  );
};

const AxisSliderRow = ({ axis, label, active, value, onToggle, onChange, disabled = false }) => {
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: "flex items-center",
      style: {
        gap: "8px",
        padding: "6px 0",
        borderBottom: "1px solid var(--border-color)",
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? "none" : "auto"
      },
      children: [
        /* @__PURE__ */ jsx(
          Checkbox,
          {
            checked: active,
            onChange: (e) => onToggle(e),
            style: {
              width: "16px",
              height: "16px",
              cursor: "pointer",
              flexShrink: 0
            }
          }
        ),
        /* @__PURE__ */ jsx(
          "span",
          {
            style: {
              fontSize: "12px",
              fontWeight: "600",
              minWidth: "16px",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              flexShrink: 0
            },
            children: axis.toUpperCase()
          }
        ),
        /* @__PURE__ */ jsx("div", { style: { flex: 1 }, children: /* @__PURE__ */ jsx(
          DualSlider,
          {
            min: 0,
            max: 100,
            value,
            onChange,
            disabled: disabled || !active
          }
        ) }),
        /* @__PURE__ */ jsxs(
          "span",
          {
            style: {
              fontSize: "11px",
              color: "var(--text-primary)",
              minWidth: "45px",
              textAlign: "right",
              flexShrink: 0
            },
            children: [
              Math.round(value[0]),
              "-",
              Math.round(value[1]),
              "%"
            ]
          }
        )
      ]
    }
  );
};
const ClipPanel = ({
  t,
  onClose,
  clipEnabled,
  setClipEnabled,
  clipValues,
  setClipValues,
  clipActive,
  setClipActive
}) => {
  return /* @__PURE__ */ jsx(
    FloatingPanel,
    {
      title: t("clip_title"),
      onClose,
      width: 280,
      height: 260,
      resizable: false,
      storageId: "tool_clip",
      children: /* @__PURE__ */ jsxs(
        "div",
        {
          className: "flex flex-col p-3",
          style: { height: "100%", gap: "12px" },
          children: [
            /* @__PURE__ */ jsxs(
              "div",
              {
                className: "flex items-center justify-between p-2",
                style: { borderBottom: "1px solid var(--border-color)" },
                children: [
                  /* @__PURE__ */ jsx("span", { className: "text-sm font-semibold", children: t("clip_enable") }),
                  /* @__PURE__ */ jsx(Switch, { checked: clipEnabled, onChange: (v) => setClipEnabled(v) })
                ]
              }
            ),
            /* @__PURE__ */ jsxs(
              "div",
              {
                className: "flex flex-col",
                style: {
                  flex: 1,
                  opacity: clipEnabled ? 1 : 0.4,
                  pointerEvents: clipEnabled ? "auto" : "none"
                },
                children: [
                  /* @__PURE__ */ jsx(
                    AxisSliderRow,
                    {
                      axis: "x",
                      label: t("clip_x"),
                      active: clipActive.x,
                      value: clipValues.x,
                      onToggle: (v) => setClipActive({ ...clipActive, x: v }),
                      onChange: (val) => setClipValues({ ...clipValues, x: val }),
                      disabled: !clipEnabled
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    AxisSliderRow,
                    {
                      axis: "y",
                      label: t("clip_y"),
                      active: clipActive.y,
                      value: clipValues.y,
                      onToggle: (v) => setClipActive({ ...clipActive, y: v }),
                      onChange: (val) => setClipValues({ ...clipValues, y: val }),
                      disabled: !clipEnabled
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    AxisSliderRow,
                    {
                      axis: "z",
                      label: t("clip_z"),
                      active: clipActive.z,
                      value: clipValues.z,
                      onToggle: (v) => setClipActive({ ...clipActive, z: v }),
                      onChange: (val) => setClipValues({ ...clipValues, z: val }),
                      disabled: !clipEnabled
                    }
                  )
                ]
              }
            )
          ]
        }
      )
    }
  );
};

const ExportPanel = ({ t, onClose, onExport, theme }) => {
  const [format, setFormat] = useState("glb");
  return /* @__PURE__ */ jsx(FloatingPanel, { title: t("export_title"), onClose, width: 320, height: 400, resizable: false, theme, storageId: "tool_export", children: /* @__PURE__ */ jsxs("div", { style: { padding: 16 }, children: [
    /* @__PURE__ */ jsxs("div", { style: { marginBottom: 10, fontSize: 12, color: theme.textMuted }, children: [
      t("export_format"),
      ":"
    ] }),
    [
      { id: "glb", label: "GLB", desc: t("export_glb") },
      { id: "lmb", label: "LMB", desc: t("export_lmb") },
      { id: "3dtiles", label: "3D Tiles", desc: t("export_3dtiles") },
      { id: "nbim", label: "NBIM", desc: t("export_nbim") }
    ].map((opt) => /* @__PURE__ */ jsxs("label", { style: {
      display: "flex",
      alignItems: "center",
      padding: "10px",
      cursor: "pointer",
      border: `1px solid ${format === opt.id ? theme.accent : theme.border}`,
      borderRadius: 0,
      marginBottom: 8,
      backgroundColor: format === opt.id ? `${theme.accent}15` : "transparent",
      transition: "all 0.2s"
    }, children: [
      /* @__PURE__ */ jsx("input", { type: "radio", name: "exportFmt", checked: format === opt.id, onChange: () => setFormat(opt.id), style: { marginRight: 10 } }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("div", { style: { color: theme.text, fontWeight: "bold", fontSize: 14 }, children: opt.label }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: theme.textMuted }, children: opt.desc })
      ] })
    ] }, opt.id)),
    /* @__PURE__ */ jsx(
      Button,
      {
        theme,
        onClick: () => onExport(format),
        style: { width: "100%", marginTop: 10, height: 40 },
        children: t("export_btn")
      }
    )
  ] }) });
};

const ViewpointPanel = ({
  t,
  onClose,
  viewpoints,
  onSave,
  onUpdateName,
  onLoad,
  onDelete,
  theme
}) => {
  const [newName, setNewName] = useState("");
  useEffect(() => {
    setNewName(`${t("viewpoint_title") || "视点"} ${viewpoints.length + 1}`);
  }, [viewpoints.length, t]);
  const handleSave = () => {
    if (newName.trim()) {
      onSave(newName.trim());
      setNewName(`${t("viewpoint_title") || "视点"} ${viewpoints.length + 1}`);
    }
  };
  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSave();
    }
  };
  return /* @__PURE__ */ jsx(FloatingPanel, { title: t("viewpoint_title") || "视点管理", onClose, width: 360, height: 450, resizable: true, theme, storageId: "tool_viewpoint", children: /* @__PURE__ */ jsxs("div", { style: { padding: "12px", display: "flex", flexDirection: "column", height: "100%" }, children: [
    /* @__PURE__ */ jsx("div", { style: { marginBottom: 12 }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 4 }, children: [
      /* @__PURE__ */ jsx(
        "input",
        {
          autoFocus: true,
          value: newName,
          onChange: (e) => setNewName(e.target.value),
          onKeyDown: handleKeyDown,
          style: {
            flex: 1,
            height: 28,
            padding: "0 10px",
            backgroundColor: theme.bg,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 3,
            fontSize: 12,
            outline: "none",
            fontFamily: DEFAULT_FONT,
            boxSizing: "border-box",
            width: "140px"
          },
          placeholder: t("viewpoint_title") || "视点名称"
        }
      ),
      /* @__PURE__ */ jsx(Button, { theme, onClick: handleSave, style: { height: 28, padding: "0 12px", minWidth: "60px", whiteSpace: "nowrap", fontSize: 12 }, children: t("btn_confirm") || "保存" })
    ] }) }),
    /* @__PURE__ */ jsx("div", { style: {
      flex: 1,
      overflowY: "auto",
      border: `1px solid ${theme.border}`,
      borderRadius: 4,
      backgroundColor: theme.bg,
      padding: "8px",
      fontSize: "12px",
      color: theme.textMuted
    }, children: viewpoints.length === 0 ? /* @__PURE__ */ jsx("div", { style: { textAlign: "center", color: theme.textMuted, fontSize: 12, padding: "40px 0" }, children: t("viewpoint_empty") || "暂无保存的视点" }) : /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: viewpoints.map((vp) => /* @__PURE__ */ jsxs(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "8px",
          border: `1px solid ${theme.border}`,
          borderRadius: 4,
          cursor: "pointer",
          backgroundColor: theme.panelBg,
          transition: "all 0.2s"
        },
        onClick: () => onLoad(vp),
        onMouseEnter: (e) => {
          e.currentTarget.style.backgroundColor = theme.itemHover;
          e.currentTarget.style.borderColor = theme.accent;
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.backgroundColor = theme.panelBg;
          e.currentTarget.style.borderColor = theme.border;
        },
        children: [
          /* @__PURE__ */ jsx("div", { style: {
            width: 96,
            height: 72,
            backgroundColor: theme.bg,
            borderRadius: 3,
            overflow: "hidden",
            flexShrink: 0,
            border: `1px solid ${theme.border}`
          }, children: vp.image ? /* @__PURE__ */ jsx(
            "img",
            {
              src: vp.image,
              alt: vp.name,
              style: { width: "100%", height: "100%", objectFit: "cover" }
            }
          ) : /* @__PURE__ */ jsx("div", { style: {
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: theme.textMuted,
            fontSize: 10
          }, children: "无图" }) }),
          /* @__PURE__ */ jsx("div", { style: {
            fontSize: "12px",
            color: theme.text,
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }, children: vp.name }),
          /* @__PURE__ */ jsx(
            "div",
            {
              onClick: (e) => {
                e.stopPropagation();
                onDelete(vp.id);
              },
              style: {
                cursor: "pointer",
                color: theme.danger,
                opacity: 0.7,
                padding: "4px",
                borderRadius: 3,
                fontSize: "11px",
                flexShrink: 0
              },
              onMouseEnter: (e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.backgroundColor = `${theme.danger}20`;
              },
              onMouseLeave: (e) => {
                e.currentTarget.style.opacity = "0.7";
                e.currentTarget.style.backgroundColor = "transparent";
              },
              children: "删除"
            }
          )
        ]
      },
      vp.id
    )) }) })
  ] }) });
};

const formatTime = (val) => {
  const hours = Math.floor(val / 2);
  const mins = val % 2 * 30;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};
const timeToSlider = (time) => {
  return Math.round(time * 2);
};
const SunPanel = ({ t, onClose, settings, onUpdate, theme }) => {
  const timeValue = timeToSlider(settings.sunTime !== void 0 ? settings.sunTime : 12);
  return /* @__PURE__ */ jsx(FloatingPanel, { title: t("st_sun_simulation") || "光照模拟", onClose, width: 320, height: 350, resizable: false, theme, storageId: "tool_sun", children: /* @__PURE__ */ jsxs("div", { style: { padding: "16px", display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { marginBottom: 16, paddingBottom: 12, borderBottom: "1px solid var(--border-color)" }, children: [
      /* @__PURE__ */ jsx(
        Checkbox,
        {
          label: t("st_sun_enabled") || "启用太阳光",
          checked: settings.sunEnabled || false,
          onChange: (val) => onUpdate({ sunEnabled: val }),
          style: { fontWeight: "bold", fontSize: 13 }
        }
      ),
      /* @__PURE__ */ jsx("div", { style: { fontSize: 11, color: "var(--text-muted)", marginTop: 8, fontStyle: "italic" }, children: t("st_sun_info") })
    ] }),
    settings.sunEnabled && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { style: { marginBottom: 16 }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 12, color: "var(--text-secondary)" }, children: [
        /* @__PURE__ */ jsx("span", { children: t("st_sun_latitude") || "纬度" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: -90,
              max: 90,
              value: settings.sunLatitude || 0,
              onChange: (e) => {
                let val = parseFloat(e.target.value);
                val = Math.max(-90, Math.min(90, val));
                onUpdate({ sunLatitude: val });
              },
              className: "ui-input",
              style: {
                width: 70,
                textAlign: "right"
              }
            }
          ),
          /* @__PURE__ */ jsx("span", { style: { color: "var(--text-secondary)" }, children: "°" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsx("div", { style: { marginBottom: 16 }, children: /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 12, color: "var(--text-secondary)" }, children: [
        /* @__PURE__ */ jsx("span", { children: t("st_sun_longitude") || "经度" }),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
          /* @__PURE__ */ jsx(
            "input",
            {
              type: "number",
              min: -180,
              max: 180,
              value: settings.sunLongitude || 0,
              onChange: (e) => {
                let val = parseFloat(e.target.value);
                val = Math.max(-180, Math.min(180, val));
                onUpdate({ sunLongitude: val });
              },
              className: "ui-input",
              style: {
                width: 70,
                textAlign: "right"
              }
            }
          ),
          /* @__PURE__ */ jsx("span", { style: { color: "var(--text-secondary)" }, children: "°" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { style: { marginBottom: 16 }, children: [
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, fontSize: 12, color: "var(--text-secondary)" }, children: [
          /* @__PURE__ */ jsx("span", { children: t("st_sun_time") || "时间" }),
          /* @__PURE__ */ jsx("div", { style: { display: "flex", alignItems: "center", gap: 4, color: "var(--text-primary)" }, children: /* @__PURE__ */ jsx("span", { children: formatTime(timeValue) }) })
        ] }),
        /* @__PURE__ */ jsx(
          Slider,
          {
            min: 0,
            max: 48,
            step: 1,
            value: timeValue,
            onChange: (val) => {
              onUpdate({ sunTime: val / 2 });
            }
          }
        ),
        /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", padding: "0 4px", marginTop: 2 }, children: [
          /* @__PURE__ */ jsx("span", { children: "0:00" }),
          /* @__PURE__ */ jsx("span", { children: "6:00" }),
          /* @__PURE__ */ jsx("span", { children: "12:00" }),
          /* @__PURE__ */ jsx("span", { children: "18:00" }),
          /* @__PURE__ */ jsx("span", { children: "24:00" })
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { marginBottom: 8 }, children: /* @__PURE__ */ jsx(
        Checkbox,
        {
          label: t("st_sun_shadow") || "显示阴影",
          checked: settings.sunShadow || false,
          onChange: (val) => onUpdate({ sunShadow: val }),
          style: { fontSize: 12 }
        }
      ) })
    ] })
  ] }) });
};

const LoadingOverlay = ({ t, loading, status, progress, theme }) => {
  if (!loading) return null;
  return /* @__PURE__ */ jsx("div", { className: "ui-loading-overlay", children: /* @__PURE__ */ jsxs("div", { className: "ui-loading-box", children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }, children: [
      /* @__PURE__ */ jsx("div", { style: { fontWeight: "600", color: "var(--text-primary)", fontSize: "14px" }, children: status }),
      /* @__PURE__ */ jsxs("div", { style: { color: "var(--text-primary)", fontSize: "14px", fontWeight: "bold" }, children: [
        Math.round(progress),
        "%"
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "ui-progress-bar", style: { marginTop: "12px" }, children: /* @__PURE__ */ jsx(
      "div",
      {
        className: "ui-progress-fill",
        style: {
          width: `${progress}%`,
          transition: "width 0.3s ease-out"
        }
      }
    ) }),
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginTop: "12px", fontSize: "12px", color: "var(--text-muted)" }, children: [
      /* @__PURE__ */ jsxs("svg", { style: { width: "14px", height: "14px", animation: "spin 1s linear infinite" }, viewBox: "0 0 24 24", children: [
        /* @__PURE__ */ jsx("circle", { style: { opacity: 0.25 }, cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4", fill: "none" }),
        /* @__PURE__ */ jsx("path", { style: { opacity: 0.75 }, fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })
      ] }),
      /* @__PURE__ */ jsx("style", { children: `
                        @keyframes spin {
                            from { transform: rotate(0deg); }
                            to { transform: rotate(360deg); }
                        }
                    ` }),
      /* @__PURE__ */ jsx("span", { children: progress === 100 ? t("processing") : t("loading_resources") })
    ] })
  ] }) });
};

const PropertiesPanel = ({ t, selectedProps, theme }) => {
  const [collapsed, setCollapsed] = useState(/* @__PURE__ */ new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedText, setCopiedText] = useState(null);
  const toggleGroup = (group) => {
    const next = new Set(collapsed);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    setCollapsed(next);
  };
  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      setTimeout(() => setCopiedText(null), 1500);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };
  const filteredProps = React.useMemo(() => {
    if (!selectedProps || !searchQuery) return selectedProps;
    const query = searchQuery.toLowerCase();
    const result = {};
    Object.entries(selectedProps).forEach(([group, props]) => {
      const filteredGroupProps = {};
      Object.entries(props).forEach(([k, v]) => {
        if (k.toLowerCase().includes(query) || String(v).toLowerCase().includes(query)) {
          filteredGroupProps[k] = v;
        }
      });
      if (Object.keys(filteredGroupProps).length > 0) {
        result[group] = filteredGroupProps;
      }
    });
    return result;
  }, [selectedProps, searchQuery]);
  return /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", position: "relative" }, children: [
    selectedProps && /* @__PURE__ */ jsx("div", { style: { padding: "8px", borderBottom: "1px solid var(--border-color)" }, children: /* @__PURE__ */ jsx(
      "input",
      {
        type: "text",
        placeholder: t("search_props"),
        value: searchQuery,
        onChange: (e) => setSearchQuery(e.target.value),
        className: "ui-input",
        style: {
          width: "100%",
          borderRadius: "0px",
          boxSizing: "border-box"
        }
      }
    ) }),
    /* @__PURE__ */ jsx("div", { className: "flex-1 overflow-y-auto", children: filteredProps ? Object.entries(filteredProps).map(([group, props]) => /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "ui-prop-group",
          onClick: () => toggleGroup(group),
          children: [
            /* @__PURE__ */ jsx("span", { children: group }),
            /* @__PURE__ */ jsx("span", { style: { opacity: 0.6, display: "flex", alignItems: "center" }, children: collapsed.has(group) ? /* @__PURE__ */ jsx(IconChevronRight, { width: 14, height: 14 }) : /* @__PURE__ */ jsx(IconChevronDown, { width: 14, height: 14 }) })
          ]
        }
      ),
      !collapsed.has(group) && Object.entries(props).map(([k, v]) => /* @__PURE__ */ jsxs("div", { className: "ui-prop-row", children: [
        /* @__PURE__ */ jsx("div", { className: "ui-prop-key", title: k, children: k }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "ui-prop-value",
            title: String(v),
            onClick: () => handleCopy(String(v)),
            style: { cursor: "copy" },
            children: String(v)
          }
        )
      ] }, k))
    ] }, group)) : /* @__PURE__ */ jsx("div", { style: { padding: 20, color: "var(--text-muted)", textAlign: "center", marginTop: 20 }, children: t("no_selection") }) }),
    copiedText && /* @__PURE__ */ jsx("div", { style: { position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.7)", color: "white", padding: "6px 12px", borderRadius: "4px", fontSize: "12px", zIndex: 100, pointerEvents: "none" }, children: t("copied") || "已复制" })
  ] });
};

const ConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, t, theme }) => {
  if (!isOpen) return null;
  return /* @__PURE__ */ jsx(
    FloatingPanel,
    {
      title,
      onClose: onCancel,
      width: 360,
      height: 188,
      modal: true,
      movable: false,
      theme,
      children: /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: "16px",
            gap: "16px"
          },
          children: [
            /* @__PURE__ */ jsx(
              "div",
              {
                className: "text-base",
                style: {
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  color: "var(--text-primary)",
                  lineHeight: 1.6
                },
                children: message
              }
            ),
            /* @__PURE__ */ jsxs(
              "div",
              {
                style: {
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  borderTop: "1px solid var(--border-color)",
                  paddingTop: "14px"
                },
                children: [
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      className: "ui-btn ui-btn-ghost w-[80px]",
                      onClick: onCancel,
                      children: t("btn_cancel")
                    }
                  ),
                  /* @__PURE__ */ jsx(
                    "button",
                    {
                      className: "ui-btn ui-btn-danger w-[80px]",
                      style: { backgroundColor: "var(--error)", borderColor: "var(--error)", color: "white" },
                      onClick: onConfirm,
                      children: t("btn_confirm")
                    }
                  )
                ]
              }
            )
          ]
        }
      )
    }
  );
};

const AboutModal = ({ isOpen, onClose, t, theme }) => {
  if (!isOpen) return null;
  const [showLicenseDetails, setShowLicenseDetails] = useState(false);
  const [showThirdParty, setShowThirdParty] = useState(false);
  const thirdPartyLibraries = [
    { name: "three", version: "^0.181.2", description: "3D graphics library" },
    { name: "react", version: "^19.2.0", description: "UI library" },
    { name: "react-dom", version: "^19.2.0", description: "React DOM renderer" },
    { name: "3d-tiles-renderer", version: "0.3.31", description: "3D Tiles rendering" },
    { name: "web-ifc", version: "^0.0.74", description: "IFC file parser" },
    { name: "occt-import-js", version: "^0.0.23", description: "CAD file import" }
  ];
  return /* @__PURE__ */ jsx(
    FloatingPanel,
    {
      title: t("about_title"),
      onClose,
      width: 400,
      height: 520,
      modal: true,
      theme,
      children: /* @__PURE__ */ jsxs("div", { style: { padding: "12px", display: "flex", flexDirection: "column", gap: "10px", height: "100%", overflowY: "auto" }, children: [
        /* @__PURE__ */ jsxs("div", { style: { textAlign: "center" }, children: [
          /* @__PURE__ */ jsx("div", { style: { fontSize: "20px", fontWeight: "bold", marginBottom: "6px", color: "var(--text-primary)" }, children: "3D Browser" }),
          /* @__PURE__ */ jsx("div", { style: { fontSize: "11px", opacity: 0.7 }, children: "Professional 3D Model Viewer" })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { width: "100%", display: "flex", flexDirection: "column", gap: "8px", fontSize: "12px" }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }, children: [
            /* @__PURE__ */ jsx("span", { style: { opacity: 0.7 }, children: t("about_author") }),
            /* @__PURE__ */ jsx("span", { style: { fontWeight: "500" }, children: "zhangly1403@163.com" })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }, children: [
            /* @__PURE__ */ jsx("span", { style: { opacity: 0.7 }, children: t("project_url") }),
            /* @__PURE__ */ jsx("a", { href: "https://github.com/zly258/3dbrowser", target: "_blank", rel: "noopener noreferrer", className: "ui-link", children: "github.com/zly258/3dbrowser" })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: "6px" }, children: [
            /* @__PURE__ */ jsx("span", { style: { opacity: 0.7 }, children: t("about_license") }),
            /* @__PURE__ */ jsx("span", { style: { fontWeight: "500", color: "var(--error)" }, children: t("about_license_nc") })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { border: "1px solid var(--border-color)", borderRadius: "4px", overflow: "hidden" }, children: [
          /* @__PURE__ */ jsxs(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                backgroundColor: "var(--bg-header)",
                cursor: "pointer",
                userSelect: "none"
              },
              onClick: () => setShowLicenseDetails(!showLicenseDetails),
              children: [
                /* @__PURE__ */ jsx("span", { style: { fontWeight: "500", fontSize: "12px" }, children: t("license_details") }),
                showLicenseDetails ? /* @__PURE__ */ jsx(IconChevronUp, { width: 14, height: 14 }) : /* @__PURE__ */ jsx(IconChevronDown, { width: 14, height: 14 })
              ]
            }
          ),
          showLicenseDetails && /* @__PURE__ */ jsxs("div", { style: { padding: "12px", fontSize: "11px", lineHeight: "1.5", backgroundColor: "var(--bg-primary)", maxHeight: "180px", overflowY: "auto" }, children: [
            /* @__PURE__ */ jsx("div", { style: { whiteSpace: "pre-wrap", marginBottom: "8px" }, children: t("license_summary") }),
            /* @__PURE__ */ jsxs("div", { style: { fontSize: "10px", opacity: 0.7, marginTop: "8px" }, children: [
              t("full_license"),
              " ",
              /* @__PURE__ */ jsx("a", { href: "https://creativecommons.org/licenses/by-nc/4.0/", target: "_blank", rel: "noopener noreferrer", className: "ui-link", children: "CC BY-NC 4.0" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { border: "1px solid var(--border-color)", borderRadius: "4px", overflow: "hidden" }, children: [
          /* @__PURE__ */ jsxs(
            "div",
            {
              style: {
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 12px",
                backgroundColor: "var(--bg-header)",
                cursor: "pointer",
                userSelect: "none"
              },
              onClick: () => setShowThirdParty(!showThirdParty),
              children: [
                /* @__PURE__ */ jsx("span", { style: { fontWeight: "500", fontSize: "12px" }, children: t("third_party_libs") }),
                showThirdParty ? /* @__PURE__ */ jsx(IconChevronUp, { width: 14, height: 14 }) : /* @__PURE__ */ jsx(IconChevronDown, { width: 14, height: 14 })
              ]
            }
          ),
          showThirdParty && /* @__PURE__ */ jsxs("div", { style: { padding: "12px", fontSize: "11px", lineHeight: "1.5", backgroundColor: "var(--bg-primary)", maxHeight: "180px", overflowY: "auto" }, children: [
            /* @__PURE__ */ jsx("div", { style: { marginBottom: "8px", opacity: 0.8 }, children: t("third_party_desc") }),
            /* @__PURE__ */ jsx("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: thirdPartyLibraries.map((lib, index) => /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
              /* @__PURE__ */ jsxs("div", { style: { flex: 1 }, children: [
                /* @__PURE__ */ jsx("div", { style: { fontWeight: "500" }, children: lib.name }),
                /* @__PURE__ */ jsx("div", { style: { fontSize: "10px", opacity: 0.7 }, children: lib.description })
              ] }),
              /* @__PURE__ */ jsx("div", { style: { fontSize: "10px", opacity: 0.7, minWidth: "50px", textAlign: "right" }, children: lib.version })
            ] }, index)) }),
            /* @__PURE__ */ jsx("div", { style: { fontSize: "10px", opacity: 0.7, marginTop: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "8px" }, children: t("view_package_json") })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { style: { fontSize: "11px", opacity: 0.5, textAlign: "center", marginTop: "auto" }, children: "Copyright © 2026. All rights reserved." })
      ] })
    }
  );
};

const ViewCube = ({ sceneMgr, lang = "zh", theme }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const cubeRef = useRef(null);
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());
  const hoveredPart = useRef(null);
  const cubeSize = sceneMgr?.settings?.viewCubeSize || 100;
  const t = (key) => getTranslation(lang, key);
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const width = cubeSize;
    const height = cubeSize;
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: false
    });
    if (gl) {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
    const renderer = new THREE.WebGLRenderer({
      canvas,
      context: gl || void 0,
      antialias: true,
      alpha: true,
      precision: "mediump"
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    rendererRef.current = renderer;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0, 3.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    const ambientLight = new THREE.AmbientLight(16777215, 1);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(16777215, 0.6);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);
    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);
    cubeRef.current = cubeGroup;
    const createFaceTexture = (text, rotation = 0) => {
      const canvas2 = document.createElement("canvas");
      canvas2.width = 128;
      canvas2.height = 128;
      const context = canvas2.getContext("2d");
      if (context) {
        context.fillStyle = "#f8f9fa";
        context.fillRect(0, 0, 128, 128);
        context.save();
        context.translate(64, 64);
        if (rotation !== 0) {
          context.rotate(rotation * Math.PI / 180);
        }
        context.fillStyle = "#333333";
        context.font = lang === "zh" ? 'bold 54px "Microsoft YaHei", sans-serif' : "bold 32px Arial, sans-serif";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, 0, 0);
        context.restore();
        context.strokeStyle = "#cccccc";
        context.lineWidth = 4;
        context.strokeRect(2, 2, 124, 124);
      }
      const texture = new THREE.CanvasTexture(canvas2);
      return texture;
    };
    const faceColor = 16316922;
    const edgeColor = 16316922;
    const cornerColor = 16316922;
    const createPart = (size, pos, name, color, text, rotation = 0) => {
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      let material;
      if (text) {
        const texture = createFaceTexture(text, rotation);
        material = new THREE.MeshPhongMaterial({
          map: texture,
          transparent: true,
          opacity: 0.98,
          shininess: 30
        });
      } else {
        material = new THREE.MeshPhongMaterial({
          color,
          transparent: true,
          opacity: 0.98,
          shininess: 30
        });
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(pos);
      mesh.name = name;
      mesh.userData.originalOpacity = material.opacity;
      mesh.userData.originalColor = material.color.clone();
      mesh.userData.isFace = !!text;
      cubeGroup.add(mesh);
      return mesh;
    };
    const faceSize = 0.88;
    const edgeSize = 0.12;
    const cornerSize = 0.12;
    const offset = 0.5;
    createPart(new THREE.Vector3(faceSize, 0.05, faceSize), new THREE.Vector3(0, -offset, 0), "front", faceColor, t("cube_front"));
    createPart(new THREE.Vector3(faceSize, 0.05, faceSize), new THREE.Vector3(0, offset, 0), "back", faceColor, t("cube_back"), 180);
    createPart(new THREE.Vector3(faceSize, faceSize, 0.05), new THREE.Vector3(0, 0, offset), "top", faceColor, t("cube_top"), 270);
    createPart(new THREE.Vector3(faceSize, faceSize, 0.05), new THREE.Vector3(0, 0, -offset), "bottom", faceColor, t("cube_bottom"));
    createPart(new THREE.Vector3(0.05, faceSize, faceSize), new THREE.Vector3(-offset, 0, 0), "left", faceColor, t("cube_left"), 90);
    createPart(new THREE.Vector3(0.05, faceSize, faceSize), new THREE.Vector3(offset, 0, 0), "right", faceColor, t("cube_right"), 270);
    createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, -offset, offset), "top-front", edgeColor);
    createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, offset, offset), "top-back", edgeColor);
    createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(-offset, 0, offset), "top-left", edgeColor);
    createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(offset, 0, offset), "top-right", edgeColor);
    createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, -offset, -offset), "bottom-front", edgeColor);
    createPart(new THREE.Vector3(faceSize, edgeSize, edgeSize), new THREE.Vector3(0, offset, -offset), "bottom-back", edgeColor);
    createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(-offset, 0, -offset), "bottom-left", edgeColor);
    createPart(new THREE.Vector3(edgeSize, faceSize, edgeSize), new THREE.Vector3(offset, 0, -offset), "bottom-right", edgeColor);
    createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(-offset, -offset, 0), "front-left", edgeColor);
    createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(offset, -offset, 0), "front-right", edgeColor);
    createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(-offset, offset, 0), "back-left", edgeColor);
    createPart(new THREE.Vector3(edgeSize, edgeSize, faceSize), new THREE.Vector3(offset, offset, 0), "back-right", edgeColor);
    createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, -offset, offset), "top-front-left", cornerColor);
    createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, -offset, offset), "top-front-right", cornerColor);
    createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, offset, offset), "top-back-left", cornerColor);
    createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, offset, offset), "top-back-right", cornerColor);
    createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, -offset, -offset), "bottom-front-left", cornerColor);
    createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, -offset, -offset), "bottom-front-right", cornerColor);
    createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(-offset, offset, -offset), "bottom-back-left", cornerColor);
    createPart(new THREE.Vector3(cornerSize, cornerSize, cornerSize), new THREE.Vector3(offset, offset, -offset), "bottom-back-right", cornerColor);
    let animationId;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (sceneMgr && cubeRef.current) {
        cubeRef.current.quaternion.copy(sceneMgr.camera.quaternion).invert();
      }
      renderer.render(scene, camera);
    };
    animate();
    return () => {
      cancelAnimationFrame(animationId);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
    };
  }, [sceneMgr, cubeSize, lang]);
  const handleMouseMove = (event) => {
    if (!canvasRef.current || !sceneRef.current || !cameraRef.current || !cubeRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    mouse.current.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    const intersects = raycaster.current.intersectObjects(cubeRef.current.children);
    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      if (hoveredPart.current !== mesh) {
        if (hoveredPart.current) {
          const mat2 = hoveredPart.current.material;
          mat2.opacity = hoveredPart.current.userData.originalOpacity;
          mat2.color.copy(hoveredPart.current.userData.originalColor);
        }
        hoveredPart.current = mesh;
        const mat = mesh.material;
        mat.opacity = 1;
        mat.color.set(30932);
      }
      containerRef.current.style.cursor = "pointer";
    } else {
      if (hoveredPart.current) {
        const mat = hoveredPart.current.material;
        mat.opacity = hoveredPart.current.userData.originalOpacity;
        mat.color.copy(hoveredPart.current.userData.originalColor);
        hoveredPart.current = null;
      }
      containerRef.current.style.cursor = "default";
    }
  };
  const handleMouseLeave = () => {
    if (hoveredPart.current) {
      const mat = hoveredPart.current.material;
      mat.opacity = hoveredPart.current.userData.originalOpacity;
      mat.color.copy(hoveredPart.current.userData.originalColor);
      hoveredPart.current = null;
    }
  };
  const handleClick = (event) => {
    if (!canvasRef.current || !sceneRef.current || !cameraRef.current || !sceneMgr) return;
    const rect = canvasRef.current.getBoundingClientRect();
    mouse.current.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.current.setFromCamera(mouse.current, cameraRef.current);
    const intersects = raycaster.current.intersectObjects(cubeRef.current.children);
    if (intersects.length > 0) {
      const name = intersects[0].object.name;
      handleViewChange(name);
    }
  };
  const handleViewChange = (viewName) => {
    if (!sceneMgr) return;
    let targetView = viewName;
    if (viewName === "top-front-right") targetView = "se";
    else if (viewName === "top-front-left") targetView = "sw";
    else if (viewName === "top-back-right") targetView = "ne";
    else if (viewName === "top-back-left") targetView = "nw";
    sceneMgr.setView(targetView);
  };
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: containerRef,
      style: {
        position: "absolute",
        top: "10px",
        right: "10px",
        width: `${cubeSize}px`,
        height: `${cubeSize}px`,
        zIndex: 100,
        pointerEvents: "auto",
        borderRadius: "8px",
        overflow: "hidden"
      },
      onClick: handleClick,
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave,
      children: /* @__PURE__ */ jsx("canvas", { ref: canvasRef })
    }
  );
};

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary捕获到错误:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      const { t, theme } = this.props;
      return /* @__PURE__ */ jsxs("div", { style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: DEFAULT_FONT,
        gap: "20px",
        padding: "40px",
        textAlign: "center"
      }, children: [
        /* @__PURE__ */ jsx("div", { style: { fontSize: "64px" }, children: "⚠️" }),
        /* @__PURE__ */ jsx("h1", { style: { fontSize: "24px", margin: 0 }, children: t("error_title") }),
        /* @__PURE__ */ jsx("p", { style: { color: theme.textMuted, maxWidth: "600px", lineHeight: "1.6" }, children: t("error_msg") }),
        /* @__PURE__ */ jsx(
          "button",
          {
            onClick: () => window.location.reload(),
            style: {
              padding: "10px 24px",
              backgroundColor: theme.accent,
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold"
            },
            children: t("error_reload")
          }
        )
      ] });
    }
    return this.props.children;
  }
}

const ContextMenu = ({ x, y, items, onClose, theme }) => {
  const menuRef = useRef(null);
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: menuRef,
      className: "ui-context-menu",
      style: { left: x, top: y },
      children: items.map((item, index) => {
        if (item.divider) {
          return /* @__PURE__ */ jsx(
            "div",
            {
              className: "ui-context-menu-divider"
            },
            index
          );
        }
        if (item.slider) {
          return /* @__PURE__ */ jsxs("div", { className: "ui-context-menu-item", style: { display: "flex", flexDirection: "column", gap: "4px", cursor: "default" }, children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "12px" }, children: [
              /* @__PURE__ */ jsx("span", { children: item.label }),
              /* @__PURE__ */ jsxs("span", { children: [
                Math.round((item.value || 0) * 100),
                "%"
              ] })
            ] }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "range",
                min: "0",
                max: "1",
                step: "0.01",
                value: item.value || 0,
                onChange: (e) => item.onChange?.(parseFloat(e.target.value)),
                style: { width: "100%", cursor: "pointer" }
              }
            )
          ] }, index);
        }
        return /* @__PURE__ */ jsx(
          "div",
          {
            onClick: () => {
              if (!item.disabled && item.onClick) {
                item.onClick();
                onClose();
              }
            },
            className: `ui-context-menu-item ${item.disabled ? "disabled" : ""}`,
            children: item.label
          },
          index
        );
      })
    }
  );
};

function usePersistentState(key, initialValue, options = {}) {
  const {
    storage = typeof window !== "undefined" ? window.localStorage : void 0,
    serializer = JSON.stringify,
    parser = JSON.parse
  } = options;
  const resolveInitialValue = () => typeof initialValue === "function" ? initialValue() : initialValue;
  const [state, setState] = useState(() => {
    const fallback = resolveInitialValue();
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      if (raw === null) return fallback;
      return parser(raw);
    } catch (error) {
      console.warn(`[usePersistentState] Failed to read "${key}"`, error);
      return fallback;
    }
  });
  useEffect(() => {
    if (!storage) return;
    try {
      storage.setItem(key, serializer(state));
    } catch (error) {
      console.warn(`[usePersistentState] Failed to write "${key}"`, error);
    }
  }, [key, serializer, state, storage]);
  return [state, setState];
}

function cleanLoadingStatus(message) {
  if (!message) return "";
  return message.replace(/:\s*\d+%/g, "").replace(/\(\d+%\)/g, "").replace(/\d+%/g, "").trim();
}
function createFileSetId(items) {
  const names = items.map((item) => typeof item === "string" ? item : item.name).sort();
  return names.join("|");
}
async function loadSceneItems({
  items,
  manager,
  sceneSettings,
  libPath,
  t,
  onProgress
}) {
  if (!items.length) return;
  const nbimItems = [];
  const otherItems = [];
  for (const item of items) {
    const path = typeof item === "string" ? item.split("?")[0].split("#")[0] : item.name;
    if (path.toLowerCase().endsWith(".nbim")) {
      nbimItems.push(item);
    } else {
      otherItems.push(item);
    }
  }
  for (const item of nbimItems) {
    if (typeof item === "string") {
      const response = await fetch(item);
      if (!response.ok) throw new Error(`HTTP ${response.status} when fetching NBIM`);
      const blob = await response.blob();
      const fileName = item.split("?")[0].split("#")[0].split("/").pop() || "model.nbim";
      const file = new File([blob], fileName);
      await manager.loadNbim(file, (p, msg) => {
        onProgress(p, msg);
      });
    } else {
      await manager.loadNbim(item, (p, msg) => {
        onProgress(p, msg);
      });
    }
  }
  if (otherItems.length === 0) return;
  const loadedObjects = await loadModelFiles(
    otherItems,
    onProgress,
    t,
    sceneSettings,
    libPath
  );
  const totalObjects = Math.max(loadedObjects.length, 1);
  for (let index = 0; index < loadedObjects.length; index++) {
    const obj = loadedObjects[index];
    const objectBase = 92 + Math.round(index / totalObjects * 8);
    await manager.addModel(obj, (p, msg) => {
      const stagedProgress = Math.min(100, objectBase + Math.round(p / 100 * (8 / totalObjects)));
      onProgress(stagedProgress, msg);
    });
  }
}

const ThreeViewer = ({
  allowDragOpen = true,
  hiddenMenus = [],
  libPath = "./libs",
  defaultTheme,
  defaultLang,
  showStats: propShowStats,
  showOutline: propShowOutline,
  showProperties: propShowProperties,
  initialSettings,
  initialFiles,
  onSelect: propOnSelect,
  onLoad,
  hideDeleteModel = false
}) => {
  const sceneBgFollowsTheme = initialSettings?.bgColor === void 0;
  const [themeMode, setThemeMode] = usePersistentState(
    "3dbrowser_themeMode",
    () => defaultTheme || "light",
    {
      serializer: (value) => value,
      parser: (raw) => raw === "dark" || raw === "light" ? raw : "light"
    }
  );
  const theme = useMemo(() => {
    return themes[themeMode];
  }, [themeMode]);
  const [lang, setLang] = usePersistentState(
    "3dbrowser_lang",
    () => defaultLang || "zh",
    {
      serializer: (value) => value,
      parser: (raw) => raw === "zh" || raw === "en" ? raw : "zh"
    }
  );
  useEffect(() => {
    if (defaultLang && defaultLang !== lang) {
      setLang(defaultLang);
    }
  }, [defaultLang, lang, setLang]);
  const [treeRoot, setTreeRoot] = useState([]);
  const [selectedUuids, setSelectedUuids] = useState([]);
  const selectedUuid = selectedUuids.length > 0 ? selectedUuids[selectedUuids.length - 1] : null;
  const [selectedProps, setSelectedProps] = useState(null);
  const [status, setStatus] = useState(getTranslation(lang, "ready"));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({
    meshes: 0,
    faces: 0,
    memory: 0,
    textureMemory: 0,
    drawCalls: 0,
    fps: 0,
    chunksLoaded: 0,
    chunksTotal: 0,
    chunksQueued: 0,
    pixelRatio: 1
  });
  const [chunkProgress, setChunkProgress] = useState({ loaded: 0, total: 0 });
  const [activeTool, setActiveTool] = useState("none");
  const [mousePos, setMousePos] = useState(null);
  const [displayMode, setDisplayMode] = useState("solid");
  const [viewpoints, setViewpoints] = useState([]);
  const [currentFileSetId, setCurrentFileSetId] = useState("");
  const [measureType, setMeasureType] = useState("none");
  const [measureHistory, setMeasureHistory] = useState([]);
  const [highlightedMeasureId, setHighlightedMeasureId] = useState(null);
  const [clipEnabled, setClipEnabled] = useState(false);
  const [clipValues, setClipValues] = useState({ x: [0, 100], y: [0, 100], z: [0, 100] });
  const [clipActive, setClipActive] = useState({ x: false, y: false, z: false });
  const [pickEnabled, setPickEnabled] = usePersistentState("3dbrowser_pickEnabled", false, {
    serializer: (value) => String(value),
    parser: (raw) => raw === "true"
  });
  const [showStats, setShowStats] = usePersistentState("3dbrowser_showStats", propShowStats ?? true, {
    serializer: (value) => String(value),
    parser: (raw) => raw === "true"
  });
  const [showOutline, setShowOutline] = usePersistentState("3dbrowser_showOutline", propShowOutline ?? true, {
    serializer: (value) => String(value),
    parser: (raw) => raw === "true"
  });
  const [showProps, setShowProps] = usePersistentState("3dbrowser_showProps", propShowProperties ?? true, {
    serializer: (value) => String(value),
    parser: (raw) => raw === "true"
  });
  const [sceneSettings, setSceneSettings] = usePersistentState("3dbrowser_sceneSettings", () => {
    const baseSettings = {
      ambientInt: 2,
      dirInt: 1,
      bgColor: theme.canvasBg,
      viewCubeSize: 100,
      colorSpace: "srgb",
      toneMapping: "aces",
      exposure: 1,
      shadowQuality: "medium",
      adaptiveQuality: true,
      minPixelRatio: 0.8,
      maxPixelRatio: 2,
      targetFps: 50,
      sunEnabled: false,
      sunLatitude: 0,
      sunLongitude: 0,
      sunTime: 12,
      sunShadow: false
    };
    const merged = initialSettings ? { ...baseSettings, ...initialSettings } : baseSettings;
    return sceneBgFollowsTheme ? { ...merged, bgColor: theme.canvasBg } : merged;
  });
  useEffect(() => {
    if (propShowStats !== void 0) setShowStats(propShowStats);
  }, [propShowStats, setShowStats]);
  useEffect(() => {
    if (propShowOutline !== void 0) setShowOutline(propShowOutline);
  }, [propShowOutline, setShowOutline]);
  useEffect(() => {
    if (propShowProperties !== void 0) setShowProps(propShowProperties);
  }, [propShowProperties, setShowProps]);
  const [confirmState, setConfirmState] = useState({ isOpen: false, title: "", message: "", action: () => {
  } });
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(300);
  const resizingLeft = useRef(false);
  const resizingRight = useRef(false);
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const sceneMgr = useRef(null);
  const [mgrInstance, setMgrInstance] = useState(null);
  const pointerDownRef = useRef(null);
  const handleThemeModeChange = useCallback((nextThemeMode) => {
    setThemeMode(nextThemeMode);
    const nextTheme = themes[nextThemeMode];
    setSceneSettings((prevSettings) => {
      const merged = sceneBgFollowsTheme ? { ...prevSettings, bgColor: nextTheme.canvasBg } : prevSettings;
      if (sceneMgr.current && sceneBgFollowsTheme) {
        sceneMgr.current.updateSettings(merged);
      }
      return merged;
    });
  }, [sceneBgFollowsTheme, setSceneSettings, setThemeMode]);
  useEffect(() => {
    if (defaultTheme && defaultTheme !== themeMode) {
      handleThemeModeChange(defaultTheme);
    }
  }, [defaultTheme, themeMode, handleThemeModeChange]);
  useEffect(() => {
    if (!sceneBgFollowsTheme) return;
    setSceneSettings((prevSettings) => {
      if (prevSettings.bgColor === theme.canvasBg) return prevSettings;
      const merged = { ...prevSettings, bgColor: theme.canvasBg };
      if (sceneMgr.current) {
        sceneMgr.current.updateSettings(merged);
      }
      return merged;
    });
  }, [sceneBgFollowsTheme, setSceneSettings, theme.canvasBg]);
  const hasModels = treeRoot.length > 0;
  const completedFileSetsRef = useRef(/* @__PURE__ */ new Set());
  const [errorState, setErrorState] = useState({ isOpen: false, title: "", message: "" });
  const [toast, setToast] = useState(null);
  const [contextMenu, setContextMenu] = useState({ x: 0, y: 0, visible: false });
  const [hiddenUuids, setHiddenUuids] = useState(/* @__PURE__ */ new Set());
  const [isolatedUuids, setIsolatedUuids] = useState(/* @__PURE__ */ new Set());
  const [contextMenuOpacity, setContextMenuOpacity] = useState(1);
  const visibilityStackRef = useRef([]);
  const handleHideSelected = useCallback(() => {
    if (selectedUuids.length === 0 || !sceneMgr.current) return;
    const stateToRestore = selectedUuids.map((uuid) => {
      const obj = sceneMgr.current?.contentGroup.getObjectByProperty("uuid", uuid);
      return { uuid, visible: obj ? obj.visible : true };
    });
    visibilityStackRef.current.push(stateToRestore);
    const newHiddenUuids = new Set(hiddenUuids);
    const newIsolatedUuids = new Set(isolatedUuids);
    selectedUuids.forEach((uuid) => {
      sceneMgr.current?.setObjectVisibility(uuid, false);
      newHiddenUuids.add(uuid);
      newIsolatedUuids.delete(uuid);
    });
    setHiddenUuids(newHiddenUuids);
    setIsolatedUuids(newIsolatedUuids);
    setSelectedUuids([]);
    setSelectedProps(null);
    sceneMgr.current?.highlightObjects([]);
    updateTree();
  }, [selectedUuids, hiddenUuids, isolatedUuids]);
  const handleShowAll = useCallback(() => {
    if (!sceneMgr.current) return;
    if (hiddenUuids.size > 0 || isolatedUuids.size > 0) {
      sceneMgr.current.setAllVisibility(true);
      setHiddenUuids(/* @__PURE__ */ new Set());
      setIsolatedUuids(/* @__PURE__ */ new Set());
      updateTree();
    }
  }, [hiddenUuids, isolatedUuids]);
  const t = useCallback((key) => getTranslation(lang, key), [lang]);
  useEffect(() => {
    const handleError = (event) => {
      const message = event.message || "";
      if (!message && !event.error) return;
      if (message.includes("ResizeObserver loop completed") || message.includes("ResizeObserver loop limit") || message.includes("texImage3D: FLIP_Y or PREMULTIPLY_ALPHA")) {
        return;
      }
      console.error("Global Error:", event.error || message);
      setErrorState({
        isOpen: true,
        title: t("failed"),
        message: message || "An unexpected error occurred",
        detail: event.error?.stack || ""
      });
    };
    const handleRejection = (event) => {
      if (!event.reason) return;
      const message = event.reason?.message || String(event.reason);
      if (message.includes("ResizeObserver loop completed") || message.includes("ResizeObserver loop limit") || message.includes("texImage3D: FLIP_Y or PREMULTIPLY_ALPHA")) {
        return;
      }
      console.error("Unhandled Rejection:", event.reason);
      setErrorState({
        isOpen: true,
        title: t("failed"),
        message: message || "A promise was rejected without reason",
        detail: event.reason?.stack || ""
      });
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [lang, t]);
  useEffect(() => {
    const prevLang = lang === "zh" ? "en" : "zh";
    if (status === getTranslation(prevLang, "ready")) {
      setStatus(getTranslation(lang, "ready"));
    }
  }, [lang]);
  useEffect(() => {
    const handleMove = (e) => {
      if (resizingLeft.current) {
        setLeftWidth(Math.max(150, Math.min(500, e.clientX)));
      }
      if (resizingRight.current) {
        const newW = window.innerWidth - e.clientX;
        setRightWidth(Math.max(200, Math.min(600, newW)));
      }
    };
    const handleUp = () => {
      resizingLeft.current = false;
      resizingRight.current = false;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);
  const formatNumber = (num) => {
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(1) + "K";
    return num.toString();
  };
  const formatMemory = (mb) => {
    if (mb >= 1024) return (mb / 1024).toFixed(2) + " GB";
    return mb.toFixed(1) + " MB";
  };
  useEffect(() => {
    if (!currentFileSetId) {
      setViewpoints([]);
      return;
    }
    try {
      const key = `viewpoints_${currentFileSetId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        setViewpoints(JSON.parse(saved));
      } else {
        setViewpoints([]);
      }
    } catch (e) {
      console.error("Failed to load viewpoints", e);
      setViewpoints([]);
    }
  }, [currentFileSetId]);
  const handleSaveViewpoint = useCallback((customName) => {
    if (!sceneMgr.current || !currentFileSetId) {
      setToast({ message: t("no_models"), type: "info" });
      return;
    }
    const hasModels2 = sceneMgr.current.contentGroup.children.length > 0;
    if (!hasModels2) {
      setToast({ message: t("no_models"), type: "info" });
      return;
    }
    const name = customName || `${t("viewpoint_title")} ${viewpoints.length + 1}`;
    const cameraState = sceneMgr.current.getCameraState();
    let image = "";
    try {
      sceneMgr.current.renderer.render(sceneMgr.current.scene, sceneMgr.current.camera);
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = 64;
      tempCanvas.height = 48;
      const ctx = tempCanvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(sceneMgr.current.canvas, 0, 0, 64, 48);
        image = tempCanvas.toDataURL("image/jpeg", 0.7);
      }
    } catch (e) {
      console.error("Failed to capture thumbnail", e);
    }
    const newVP = {
      id: Date.now().toString(),
      name,
      cameraState,
      image
    };
    const nextViewpoints = [...viewpoints, newVP];
    setViewpoints(nextViewpoints);
    try {
      localStorage.setItem(`viewpoints_${currentFileSetId}`, JSON.stringify(nextViewpoints));
      setToast({ message: t("success"), type: "success" });
    } catch (e) {
      console.error("Failed to save viewpoints to storage", e);
    }
  }, [viewpoints, currentFileSetId, t]);
  const handleUpdateViewpointName = useCallback((id, newName) => {
    const nextViewpoints = viewpoints.map((v) => v.id === id ? { ...v, name: newName } : v);
    setViewpoints(nextViewpoints);
    try {
      localStorage.setItem(`viewpoints_${currentFileSetId}`, JSON.stringify(nextViewpoints));
    } catch (e) {
      console.error("Failed to update viewpoint name", e);
    }
  }, [viewpoints, currentFileSetId]);
  const handleLoadViewpoint = useCallback((vp) => {
    if (!sceneMgr.current || !vp.cameraState) return;
    sceneMgr.current.setCameraState(vp.cameraState);
    setToast({ message: `${t("viewpoint_loading")}: ${vp.name}`, type: "info" });
  }, [t]);
  const handleDeleteViewpoint = useCallback((id) => {
    const nextViewpoints = viewpoints.filter((v) => v.id !== id);
    setViewpoints(nextViewpoints);
    try {
      localStorage.setItem(`viewpoints_${currentFileSetId}`, JSON.stringify(nextViewpoints));
    } catch (e) {
      console.error("Failed to delete viewpoint", e);
    }
  }, [viewpoints, currentFileSetId]);
  useEffect(() => {
    if (!viewportRef.current || !mgrInstance) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      if (width === 0 || height === 0) return;
      requestAnimationFrame(() => {
        if (mgrInstance) {
          mgrInstance.resize(width, height);
        }
      });
    });
    observer.observe(viewportRef.current);
    const handleWindowResize = () => {
      if (mgrInstance && viewportRef.current) {
        const rect = viewportRef.current.getBoundingClientRect();
        mgrInstance.resize(rect.width, rect.height);
      }
    };
    window.addEventListener("resize", handleWindowResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [mgrInstance]);
  useEffect(() => {
    const handleDragOver2 = (e) => {
      if (!allowDragOpen) return;
      e.preventDefault();
      e.stopPropagation();
    };
    const handleDrop2 = async (e) => {
      if (!allowDragOpen) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files);
        const supportedExtensions = [".lmb", ".glb", ".gltf", ".ifc", ".nbim", ".fbx", ".obj", ".stl", ".ply", ".3ds", ".dae", ".stp", ".step", ".igs", ".iges"];
        const unsupportedFiles = files.filter((f) => {
          const ext = "." + f.name.split(".").pop()?.toLowerCase();
          return !supportedExtensions.includes(ext);
        });
        if (unsupportedFiles.length > 0) {
          setToast({
            message: `${t("failed")}: 不支持的格式 - ${unsupportedFiles.map((f) => f.name).join(", ")}`,
            type: "error"
          });
        }
        const supportedFiles = files.filter((f) => {
          const ext = "." + f.name.split(".").pop()?.toLowerCase();
          return supportedExtensions.includes(ext);
        });
        if (supportedFiles.length > 0) {
          await processFiles(supportedFiles);
        }
      }
    };
    window.addEventListener("dragover", handleDragOver2);
    window.addEventListener("drop", handleDrop2);
    return () => {
      window.removeEventListener("dragover", handleDragOver2);
      window.removeEventListener("drop", handleDrop2);
    };
  }, [lang, allowDragOpen, t]);
  useEffect(() => {
    if (mgrInstance) {
      requestAnimationFrame(() => {
        mgrInstance.resize();
      });
    }
  }, [mgrInstance, showOutline, showProps, leftWidth, rightWidth]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3e3);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const updateTree = useCallback(() => {
    if (!sceneMgr.current) return;
    const root = sceneMgr.current.structureRoot;
    if (!root) {
      setTreeRoot([]);
      return;
    }
    const expandedMap = /* @__PURE__ */ new Map();
    const collectExpanded = (nodes) => {
      const stack = (nodes || []).slice();
      while (stack.length) {
        const n = stack.pop();
        if (!n) continue;
        if (typeof n.uuid === "string") expandedMap.set(n.uuid, !!n.expanded);
        if (Array.isArray(n.children) && n.children.length) {
          for (const child of n.children) {
            stack.push(child);
          }
        }
      }
    };
    const convertNode = (node, depth = 0, isFileNode = false) => {
      const stack = [{ node, depth, isFileNode }];
      const nodeMap = /* @__PURE__ */ new Map();
      const childrenMap = /* @__PURE__ */ new Map();
      const order = [];
      while (stack.length) {
        const { node: curr, depth: currDepth, isFileNode: currIsFileNode } = stack.pop();
        if (nodeMap.has(curr)) continue;
        const uuid = curr.id;
        const converted = {
          uuid,
          name: curr.name,
          type: curr.type === "Mesh" ? "MESH" : "GROUP",
          depth: currDepth,
          children: [],
          // 暂空
          expanded: expandedMap.get(uuid) ?? false,
          visible: curr.visible !== false,
          object: curr,
          isFileNode: currIsFileNode
        };
        nodeMap.set(curr, converted);
        order.push(curr);
        const children = curr.children || [];
        childrenMap.set(curr, children);
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push({ node: children[i], depth: currDepth + 1, isFileNode: false });
        }
      }
      for (const curr of order) {
        const converted = nodeMap.get(curr);
        const children = childrenMap.get(curr) || [];
        converted.children = children.map((child) => nodeMap.get(child)).filter(Boolean);
      }
      return nodeMap.get(node);
    };
    setTreeRoot((prev) => {
      collectExpanded(prev);
      const roots = [];
      (root.children || []).forEach((c) => {
        if (c.name === "ImportedModels" || c.name === "Tilesets") {
          (c.children || []).forEach((child) => {
            roots.push(convertNode(child, 0, true));
          });
        } else {
          roots.push(convertNode(c, 0, true));
        }
      });
      return roots;
    });
  }, []);
  useCallback((expanded) => {
    const update = (nodes) => {
      return nodes.map((n) => ({
        ...n,
        expanded,
        children: n.children && n.children.length > 0 ? update(n.children) : n.children
      }));
    };
    setTreeRoot((prev) => update(prev));
  }, []);
  const handleToggleVisibility = (uuid, visible) => {
    if (!sceneMgr.current) return;
    visibilityStackRef.current.push([{ uuid, visible: !visible }]);
    sceneMgr.current.setObjectVisibility(uuid, visible);
    if (visible) {
      const next = new Set(hiddenUuids);
      next.delete(uuid);
      setHiddenUuids(next);
    } else {
      const next = new Set(hiddenUuids);
      next.add(uuid);
      setHiddenUuids(next);
    }
    updateTree();
  };
  const handleUndoVisibility = useCallback(() => {
    if (visibilityStackRef.current.length === 0 || !sceneMgr.current) return;
    const lastAction = visibilityStackRef.current.pop();
    if (!lastAction) return;
    const nextHidden = new Set(hiddenUuids);
    lastAction.forEach((change) => {
      sceneMgr.current?.setObjectVisibility(change.uuid, change.visible);
      if (change.visible) nextHidden.delete(change.uuid);
      else nextHidden.add(change.uuid);
    });
    setHiddenUuids(nextHidden);
    updateTree();
  }, [hiddenUuids]);
  const handleDeleteObject = (uuid) => {
    if (!sceneMgr.current) return;
    const obj = sceneMgr.current.contentGroup.getObjectByProperty("uuid", uuid);
    const nodes = sceneMgr.current.getStructureNodes(uuid);
    if (obj || nodes) {
      const name = obj?.name || nodes?.[0]?.name || "Item";
      setConfirmState({
        isOpen: true,
        title: t("delete_item"),
        message: `${t("confirm_delete")} "${name}"?`,
        action: async () => {
          setLoading(true);
          setStatus(t("delete_item") + "...");
          try {
            await sceneMgr.current?.removeModel(uuid);
            setSelectedUuids((prev) => {
              const next = prev.filter((id) => id !== uuid);
              sceneMgr.current?.highlightObjects(next);
              if (next.length === 0) setSelectedProps(null);
              return next;
            });
            updateTree();
            setStatus(t("ready"));
            setToast({ message: t("success"), type: "success" });
          } catch (error) {
            console.error("删除对象失败:", error);
            setToast({ message: t("failed") + ": " + (error instanceof Error ? error.message : String(error)), type: "error" });
          } finally {
            setLoading(false);
          }
        }
      });
    }
  };
  const handleFocusObject = (obj) => {
    if (!sceneMgr.current || !obj) return;
    const uuid = obj.uuid || obj.id;
    if (!uuid) return;
    sceneMgr.current.fitViewToObject(uuid);
    sceneMgr.current.highlightObjects([uuid]);
    setSelectedUuids([uuid]);
  };
  const handleClearSelection = () => {
    setSelectedUuids([]);
    sceneMgr.current?.highlightObjects([]);
  };
  useEffect(() => {
    if (!canvasRef.current) return;
    const manager = new SceneManager(canvasRef.current);
    sceneMgr.current = manager;
    setMgrInstance(manager);
    if (onLoad) onLoad(manager);
    manager.updateSettings(sceneSettings);
    requestAnimationFrame(() => {
      manager.resize();
    });
    manager.onChunkProgress = (loaded, total) => {
      setChunkProgress({ loaded, total });
      if (loaded === total && total > 0 && currentFileSetId) {
        if (!completedFileSetsRef.current.has(currentFileSetId)) {
          setToast({ message: t("all_chunks_loaded"), type: "success" });
          completedFileSetsRef.current.add(currentFileSetId);
          setChunkProgress({ loaded: 0, total: 0 });
        }
      }
    };
    manager.onMeasureUpdate = (records) => {
      setMeasureHistory(records.map((r) => ({ id: r.id, type: r.type, val: r.val })));
    };
    manager.onStructureUpdate = () => {
      updateTree();
    };
    let debounceTimer;
    manager.onTilesUpdate = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        updateTree();
      }, 500);
    };
    return () => {
      manager.dispose();
    };
  }, []);
  useEffect(() => {
    if (!mgrInstance || !showStats) return;
    const updateStats = () => {
      if (document.visibilityState !== "visible") return;
      setStats(mgrInstance.getStats());
    };
    updateStats();
    const statsInterval = window.setInterval(updateStats, 1e3);
    document.addEventListener("visibilitychange", updateStats);
    return () => {
      window.clearInterval(statsInterval);
      document.removeEventListener("visibilitychange", updateStats);
    };
  }, [mgrInstance, showStats]);
  useEffect(() => {
    if (!mgrInstance || !initialFiles) return;
    const loadInitial = async () => {
      const itemsToProcess = Array.isArray(initialFiles) ? initialFiles : [initialFiles];
      console.log("[ThreeViewer] loadInitial with items:", itemsToProcess);
      const modelItems = [];
      for (const item of itemsToProcess) {
        if (typeof item === "string") {
          const urlPath = item.split("?")[0].split("#")[0];
          if (urlPath.toLowerCase().endsWith(".json") || urlPath.includes("tileset")) {
            console.log("[ThreeViewer] Initial URL detected as 3D Tiles:", item);
            mgrInstance.addTileset(item, (p, msg) => {
              setProgress(p);
              if (msg) setStatus(cleanLoadingStatus(msg));
            });
            updateTree();
            setStatus(t("tileset_loaded"));
            setTimeout(() => mgrInstance?.fitView(true), 500);
          } else {
            modelItems.push(item);
          }
        } else {
          modelItems.push(item);
        }
      }
      if (modelItems.length > 0) {
        await processFiles(modelItems);
      }
    };
    loadInitial();
  }, [mgrInstance, initialFiles]);
  useEffect(() => {
    const mgr = sceneMgr.current;
    if (!mgr) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const clickMoveThreshold = 6;
    const handleMouseDown = (e) => {
      pointerDownRef.current = {
        x: e.clientX,
        y: e.clientY,
        moved: false,
        button: e.button
      };
    };
    const handleClick = (e) => {
      const pointerState = pointerDownRef.current;
      if (!pointerState || pointerState.button !== 0 || pointerState.moved) {
        pointerDownRef.current = null;
        return;
      }
      pointerDownRef.current = null;
      if (activeTool === "boxSelect") return;
      if (activeTool === "measure") {
        if (measureType !== "none") {
          const intersect = mgr.getRayIntersects(e.clientX, e.clientY);
          if (intersect) {
            const modelUuid = intersect.object.uuid;
            mgr.addMeasurePoint(intersect.point, modelUuid);
            return;
          }
        }
        const mId = mgr.pickMeasurement(e.clientX, e.clientY);
        if (mId) {
          setHighlightedMeasureId(mId);
          mgr.highlightMeasurement(mId);
          return;
        }
        setHighlightedMeasureId(null);
        mgr.highlightMeasurement(null);
        return;
      }
      if (pickEnabled) {
        const result = mgr.pick(e.clientX, e.clientY);
        handleSelect(result ? result.object : null, result ? result.intersect : null, e.ctrlKey);
      }
    };
    const handleMouseMove = (e) => {
      if (pointerDownRef.current && !pointerDownRef.current.moved) {
        const dx = e.clientX - pointerDownRef.current.x;
        const dy = e.clientY - pointerDownRef.current.y;
        if (dx * dx + dy * dy > clickMoveThreshold * clickMoveThreshold) {
          pointerDownRef.current.moved = true;
        }
      }
      if (activeTool === "measure") {
        mgr.updateMeasureHover(e.clientX, e.clientY);
        setMousePos(null);
        return;
      }
      const intersect = mgr.getRayIntersects(e.clientX, e.clientY);
      if (intersect) {
        setMousePos(intersect.point);
      } else {
        setMousePos(null);
      }
    };
    const handleContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      let initialOpacity = 1;
      if (selectedUuids.length > 0 && mgr) {
        const obj = mgr.contentGroup.getObjectByProperty("uuid", selectedUuids[0]);
        if (obj) {
          let found = false;
          obj.traverse((child) => {
            if (!found && child.isMesh && child.material) {
              const m = Array.isArray(child.material) ? child.material[0] : child.material;
              if (m.opacity !== void 0) {
                initialOpacity = m.opacity;
                found = true;
              }
            }
          });
        }
      }
      setContextMenuOpacity(initialOpacity);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        visible: true
      });
    };
    const handleKeyDown = (e) => {
      if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) {
        handleUndoVisibility();
        return;
      }
      if (e.key === "Escape") {
        if (activeTool === "measure" && measureType !== "none") {
          setMeasureType("none");
          mgr.startMeasurement("none");
        }
        if (activeTool === "boxSelect") {
          mgr.cancelBoxSelect();
          setActiveTool("none");
        }
        setSelectedUuids([]);
        setSelectedProps(null);
        mgr.highlightObjects([]);
      }
    };
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("click", handleClick);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("click", handleClick);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickEnabled, selectedUuids, activeTool, measureType]);
  useEffect(() => {
    const mgr = sceneMgr.current;
    if (!mgr || activeTool !== "boxSelect") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    mgr.controls.mouseButtons.LEFT = void 0;
    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      mgr.startBoxSelect(e.clientX, e.clientY);
    };
    const onPointerMove = (e) => {
      mgr.updateBoxSelect(e.clientX, e.clientY);
    };
    const onPointerUp = (e) => {
      if (e.button !== 0) return;
      const uuids = mgr.endBoxSelect();
      if (uuids.length > 0) {
        const nextUuids = e.shiftKey ? [.../* @__PURE__ */ new Set([...selectedUuids, ...uuids])] : uuids;
        setSelectedUuids(nextUuids);
        mgr.highlightObjects(nextUuids);
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      if (mgr.controls) {
        mgr.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
      }
      mgr.cancelBoxSelect();
    };
  }, [activeTool]);
  useEffect(() => {
    const mgr = sceneMgr.current;
    if (!mgr) return;
    if (activeTool !== "measure") {
      mgr.clearMeasurementPreview();
      mgr.highlightMeasurement(null);
      setHighlightedMeasureId(null);
      setMeasureType("none");
    }
    if (activeTool !== "clip") {
      mgr.setClippingEnabled(false);
      setClipEnabled(false);
    }
  }, [activeTool]);
  const handleSettingsUpdate = (newSettings) => {
    const merged = {
      ...sceneSettings,
      ...newSettings,
      ...sceneBgFollowsTheme && newSettings.bgColor === void 0 ? { bgColor: theme.canvasBg } : {}
    };
    setSceneSettings(merged);
    if (sceneMgr.current) {
      sceneMgr.current.updateSettings(merged);
    }
  };
  useEffect(() => {
    if (activeTool === "clip" && sceneMgr.current) {
      sceneMgr.current.setClippingEnabled(clipEnabled);
      if (clipEnabled) {
        let box = sceneMgr.current.computeTotalBounds(true);
        if (box.isEmpty()) {
          box = sceneMgr.current.computeTotalBounds(false);
        }
        if (!box.isEmpty()) {
          sceneMgr.current.updateClippingPlanes(box, clipValues, clipActive);
        }
      }
    }
  }, [clipEnabled, clipValues, clipActive, activeTool]);
  useEffect(() => {
    if (sceneMgr.current) {
      sceneMgr.current.startMeasurement(measureType);
    }
  }, [measureType]);
  const handleSelect = async (obj, _intersect, isMultiSelect = false) => {
    if (!sceneMgr.current) return;
    if (!obj) {
      setSelectedUuids([]);
      setSelectedProps(null);
      sceneMgr.current.highlightObjects([]);
      return;
    }
    const uuid = obj.uuid || obj.id;
    if (!uuid) return;
    const nextUuids = isMultiSelect ? selectedUuids.includes(uuid) ? selectedUuids.filter((id) => id !== uuid) : [...selectedUuids, uuid] : [uuid];
    setSelectedUuids(nextUuids);
    sceneMgr.current.highlightObjects(nextUuids);
    const focusUuid = nextUuids.length > 0 ? nextUuids[nextUuids.length - 1] : null;
    if (!focusUuid) {
      setSelectedProps(null);
      return;
    }
    if (propOnSelect) propOnSelect(focusUuid, obj);
    let realObj = focusUuid === uuid && obj instanceof THREE.Object3D ? obj : sceneMgr.current.contentGroup.getObjectByProperty("uuid", focusUuid);
    if (!realObj) {
      const nodes = sceneMgr.current.getStructureNodes(focusUuid);
      if (nodes && nodes.length > 0) realObj = nodes[0];
    }
    if (!realObj && sceneMgr.current) ;
    const target = realObj || obj;
    const basicProps = {};
    const geoProps = {};
    const ifcProps = {};
    basicProps[t("prop_name")] = target.name || "Unnamed";
    basicProps[t("prop_type")] = target.type || (target.children ? "Group" : "Mesh");
    basicProps[t("prop_id")] = focusUuid;
    if (target.getWorldPosition) {
      const worldPos = new THREE.Vector3();
      target.getWorldPosition(worldPos);
      geoProps[t("prop_pos")] = `${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}`;
    }
    if (target.isMesh || target.type === "Mesh") {
      if (target instanceof THREE.Mesh) {
        const box = new THREE.Box3().setFromObject(target);
        const size = new THREE.Vector3();
        box.getSize(size);
        geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
        if (target.geometry) {
          geoProps[t("prop_vert")] = (target.geometry.attributes.position?.count || 0).toLocaleString();
          if (target.geometry.index) {
            geoProps[t("prop_tri")] = (target.geometry.index.count / 3).toLocaleString();
          } else {
            geoProps[t("prop_tri")] = ((target.geometry.attributes.position?.count || 0) / 3).toLocaleString();
          }
        }
      } else if (target.userData?.boundingBox) {
        const size = new THREE.Vector3();
        target.userData.boundingBox.getSize(size);
        geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
      }
      if (target.isInstancedMesh) {
        geoProps[t("prop_inst")] = target.count.toLocaleString();
      }
      const geometryData = sceneMgr.current.getObjectGeometryData(focusUuid);
      if (geometryData.area > 0) {
        geoProps[t("prop_area")] = geometryData.area.toFixed(3);
      }
      if (geometryData.volume > 0) {
        geoProps[t("prop_volume")] = geometryData.volume.toFixed(3);
      }
      const userData = target.userData || {};
      const parentUserData = target.parent?.userData || {};
      if (userData.isIFC || parentUserData.isIFC) {
        const ifcTarget = userData.isIFC ? target : target.parent;
        if (ifcTarget && ifcTarget.userData.ifcAPI && ifcTarget.userData.modelID !== void 0) {
          const expressID = userData.expressID;
          if (expressID) {
            try {
              const ifcMgr = ifcTarget.userData.ifcManager;
              const flatProps = await ifcMgr.getItemProperties(ifcTarget.userData.modelID, expressID);
              if (flatProps) {
                Object.assign(ifcProps, flatProps);
              }
            } catch (e) {
              console.error("IFC Props Error", e);
            }
          }
        }
      }
    } else if (target.userData?.boundingBox) {
      const size = new THREE.Vector3();
      target.userData.boundingBox.getSize(size);
      geoProps[t("prop_dim")] = `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`;
    }
    const finalProps = {
      [t("pg_basic")]: basicProps,
      [t("pg_geo")]: geoProps
    };
    if (Object.keys(ifcProps).length > 0) {
      finalProps["IFC Properties"] = ifcProps;
    }
    const nbimProps = sceneMgr.current.getNbimProperties(focusUuid);
    if (nbimProps) {
      finalProps["BIM 属性"] = nbimProps;
    }
    setSelectedProps(finalProps);
  };
  const processFiles = async (items) => {
    if (!items.length || !sceneMgr.current) return;
    const setId = createFileSetId(items);
    setCurrentFileSetId(setId);
    console.log("[ThreeViewer] processFiles called with", items.length, "items");
    sceneMgr.current.setChunkLoadingEnabled?.(true);
    sceneMgr.current.setContentVisible?.(true);
    setLoading(true);
    setStatus(t("loading"));
    setProgress(0);
    try {
      await loadItemsIntoScene(items);
      updateTree();
      setStatus(t("success"));
      console.log("[ThreeViewer] processFiles completed successfully");
      sceneMgr.current?.fitView(true);
    } catch (err) {
      console.error("[ThreeViewer] processFiles error:", err);
      setStatus(t("failed"));
      setToast({ message: `${t("failed")}: ${err.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };
  const loadItemsIntoScene = async (items) => {
    if (!items.length || !sceneMgr.current) return;
    await loadSceneItems({
      items,
      manager: sceneMgr.current,
      sceneSettings,
      libPath,
      t,
      onProgress: (p, msg) => {
        setProgress(p);
        if (msg) setStatus(cleanLoadingStatus(msg));
      }
    });
  };
  const handleOpenFiles = async (e) => {
    if (!e.target.files?.length) return;
    await processFiles(Array.from(e.target.files));
    e.target.value = "";
  };
  const handleBatchConvert = async (e) => {
    if (!e.target.files?.length || !sceneMgr.current) return;
    const files = Array.from(e.target.files);
    e.target.value = "";
    const invalid = files.filter((f) => f.name.toLowerCase().endsWith(".nbim"));
    if (invalid.length > 0) {
      setToast({ message: t("unsupported_format"), type: "info" });
      return;
    }
    sceneMgr.current.setChunkLoadingEnabled?.(false);
    sceneMgr.current.setContentVisible?.(false);
    setLoading(true);
    setStatus(t("processing") + "...");
    setProgress(0);
    setActiveTool("none");
    try {
      await sceneMgr.current.clear();
      setSelectedUuids([]);
      setSelectedProps(null);
      setMeasureHistory([]);
      updateTree();
      await loadItemsIntoScene(files);
      updateTree();
      setStatus(t("processing") + "...");
      await sceneMgr.current.exportNbim();
      setStatus(t("success"));
      setToast({ message: t("success"), type: "success" });
    } catch (err) {
      console.error("[ThreeViewer] handleBatchConvert error:", err);
      setStatus(t("failed"));
      setToast({ message: `${t("failed")}: ${err.message}`, type: "error" });
    } finally {
      try {
        await sceneMgr.current?.clear();
        updateTree();
      } catch {
      }
      sceneMgr.current.setChunkLoadingEnabled?.(true);
      sceneMgr.current.setContentVisible?.(true);
      setLoading(false);
    }
  };
  const handleOpenUrl = async () => {
    const url = window.prompt(t("menu_open_url"), "http://");
    if (!url || !url.startsWith("http")) return;
    console.log("[ThreeViewer] handleOpenUrl called with:", url);
    setLoading(true);
    setStatus(t("processing") + "...");
    try {
      const urlPath = url.split("?")[0].split("#")[0];
      console.log("[ThreeViewer] Parsed path:", urlPath);
      if (urlPath.toLowerCase().endsWith(".json") || urlPath.includes("tileset")) {
        console.log("[ThreeViewer] Detected as 3D Tiles");
        if (sceneMgr.current) {
          sceneMgr.current.addTileset(url, (p, msg) => {
            setProgress(p);
            if (msg) setStatus(cleanLoadingStatus(msg));
          });
          updateTree();
          setStatus(t("tileset_loaded"));
          sceneMgr.current?.fitView(true);
        }
      } else {
        await processFiles([url]);
      }
    } catch (err) {
      console.error("[ThreeViewer] handleOpenUrl error:", err);
      setStatus(t("failed"));
      setToast({ message: `${t("failed")}: ${err.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const supportedExtensions = [".lmb", ".glb", ".gltf", ".ifc", ".nbim", ".fbx", ".obj", ".stl", ".ply", ".3mf", ".stp", ".step", ".igs", ".iges"];
      const validFiles = files.filter((file) => {
        const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
        return supportedExtensions.includes(ext);
      });
      if (validFiles.length < files.length) {
        setToast({ message: t("unsupported_format"), type: "info" });
      }
      if (validFiles.length > 0) {
        await processFiles(validFiles);
      }
    }
  };
  const handleOpenFolder = async (e) => {
    if (!e.target.files?.length || !sceneMgr.current) return;
    setLoading(true);
    setProgress(0);
    try {
      const url = await parseTilesetFromFolder(
        e.target.files,
        (p, msg) => {
          setProgress(p);
          if (msg) setStatus(cleanLoadingStatus(msg));
        },
        t
      );
      if (url) {
        sceneMgr.current.addTileset(url, (p, msg) => {
          setProgress(p);
          if (msg) setStatus(cleanLoadingStatus(msg));
        });
        updateTree();
        setStatus(t("tileset_loaded"));
        sceneMgr.current?.fitView(true);
      }
    } catch (err) {
      console.error(err);
      setStatus(t("failed") + ": " + err.message);
    } finally {
      setLoading(false);
    }
  };
  const handleExport = async (format) => {
    if (!sceneMgr.current) return;
    const content = sceneMgr.current.contentGroup;
    if (format === "nbim") {
      if (content.children.length === 0) {
        setToast({ message: t("no_models"), type: "info" });
        return;
      }
      setLoading(true);
      setStatus(t("processing") + "...");
      setActiveTool("none");
      setTimeout(async () => {
        try {
          await sceneMgr.current?.exportNbim();
          setToast({ message: t("success"), type: "success" });
        } catch (e) {
          console.error(e);
          setToast({ message: t("failed") + ": " + e.message, type: "error" });
        } finally {
          setLoading(false);
        }
      }, 100);
      return;
    }
    const modelsToExport = content.children.filter((c) => !c.userData.isOptimizedGroup && c.name !== "TilesRenderer");
    if (modelsToExport.length === 0) {
      setToast({ message: t("no_models"), type: "info" });
      return;
    }
    const exportGroup = new THREE.Group();
    modelsToExport.forEach((m) => exportGroup.add(m.clone()));
    setLoading(true);
    setProgress(0);
    setStatus(t("processing") + "...");
    setActiveTool("none");
    setTimeout(async () => {
      try {
        let blob = null;
        let filename = `export.${format}`;
        if (format === "3dtiles") {
          if (!window.showDirectoryPicker) {
            setToast({ message: t("select_output"), type: "info" });
            throw new Error("Browser does not support directory picker");
          }
          const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
          const filesMap = await convertLMBTo3DTiles(exportGroup, (msg) => {
            if (msg.includes("%")) {
              const p = parseInt(msg.match(/(\d+)%/)?.[1] || "0");
              setProgress(p);
            }
            setStatus(cleanLoadingStatus(msg));
          });
          setStatus(t("writing"));
          let writeCount = 0;
          for (const [name, b] of filesMap) {
            const fileHandle = await dirHandle.getFileHandle(name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(b);
            await writable.close();
            writeCount++;
            if (writeCount % 5 === 0) setProgress(Math.floor(writeCount / filesMap.size * 100));
          }
          setToast({ message: t("success"), type: "success" });
          return;
        } else if (format === "glb") {
          blob = await exportGLB(exportGroup);
        } else if (format === "lmb") {
          blob = await exportLMB(exportGroup, (msg) => setStatus(cleanLoadingStatus(msg)));
        }
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
          setToast({ message: t("success"), type: "success" });
        }
      } catch (e) {
        console.error(e);
        setToast({ message: t("failed") + ": " + e.message, type: "error" });
      } finally {
        setLoading(false);
        setProgress(0);
      }
    }, 100);
  };
  const handleView = (v) => {
    sceneMgr.current?.setView(v);
  };
  const handleClear = async () => {
    if (!sceneMgr.current) return;
    setConfirmState({
      isOpen: true,
      title: t("op_clear"),
      message: t("confirm_clear"),
      action: async () => {
        setLoading(true);
        setProgress(0);
        setStatus(t("op_clear") + "...");
        try {
          await sceneMgr.current?.clear();
          setSelectedUuids([]);
          setSelectedProps(null);
          setMeasureHistory([]);
          setChunkProgress({ loaded: 0, total: 0 });
          completedFileSetsRef.current.clear();
          updateTree();
          setStatus(t("ready"));
        } catch (error) {
          console.error("清空场景失败:", error);
        } finally {
          setLoading(false);
        }
      }
    });
  };
  const handleScreenshot = () => {
    if (!sceneMgr.current) return;
    try {
      sceneMgr.current.renderer.render(sceneMgr.current.scene, sceneMgr.current.camera);
      const dataUrl = sceneMgr.current.canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "screenshot.png";
      a.click();
      setToast({ message: t("success"), type: "success" });
    } catch (e) {
      console.error(e);
      setToast({ message: t("failed"), type: "error" });
    }
  };
  const handleDisplayModeChange = (mode) => {
    if (!sceneMgr.current) return;
    setDisplayMode(mode);
    sceneMgr.current.contentGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m) => {
          if (mode === "transparent") {
            m.wireframe = false;
            m.transparent = true;
            m.opacity = 0.5;
          } else {
            m.wireframe = false;
            m.transparent = false;
            m.opacity = 1;
          }
        });
      }
    });
  };
  return /* @__PURE__ */ jsx(ErrorBoundary, { t, theme, children: /* @__PURE__ */ jsxs(
    "div",
    {
      className: `ui-container ${themeMode} font-${sceneSettings.fontSize || "medium"}`,
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        fontSize: "var(--font-size-base)",
        fontFamily: "inherit",
        userSelect: "none",
        overflow: "hidden",
        position: "relative"
      },
      onDragOver: handleDragOver,
      onDrop: handleDrop,
      children: [
        /* @__PURE__ */ jsx(
          Toolbar,
          {
            t,
            themeType: themeMode,
            setThemeType: setThemeMode,
            handleOpenFiles,
            handleBatchConvert,
            handleOpenFolder,
            handleOpenUrl,
            handleView,
            handleClear,
            handleScreenshot,
            handleDisplayModeChange,
            displayMode,
            pickEnabled,
            setPickEnabled,
            activeTool,
            setActiveTool,
            showOutline,
            setShowOutline,
            showProps,
            setShowProps,
            showStats,
            setShowStats,
            sceneMgr: sceneMgr.current,
            theme,
            hiddenMenus,
            onOpenAbout: () => setIsAboutOpen(true),
            hasModels
          }
        ),
        /* @__PURE__ */ jsxs("div", { style: { flex: 1, display: "flex", position: "relative", overflow: "hidden" }, children: [
          showOutline && /* @__PURE__ */ jsxs("div", { className: "ui-sidebar", style: {
            width: `${leftWidth}px`,
            borderRight: "1px solid var(--border-color)"
          }, children: [
            /* @__PURE__ */ jsxs("div", { className: "ui-sidebar-header", children: [
              /* @__PURE__ */ jsx("span", { children: t("interface_outline") }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  className: "ui-sidebar-close",
                  onClick: () => setShowOutline(false),
                  children: /* @__PURE__ */ jsx(IconClose, { width: 16, height: 16 })
                }
              )
            ] }),
            /* @__PURE__ */ jsx("div", { style: { flex: 1, overflow: "hidden" }, children: /* @__PURE__ */ jsx(
              SceneTree,
              {
                t,
                treeRoot,
                setTreeRoot,
                selectedUuid,
                onSelect: (_uuid, obj) => handleSelect(obj),
                onToggleVisibility: handleToggleVisibility,
                onDelete: (obj) => {
                  const uuid = obj?.uuid || obj?.id;
                  if (uuid) handleDeleteObject(uuid);
                },
                onFocus: (obj) => handleFocusObject(obj)
              }
            ) }),
            /* @__PURE__ */ jsx(
              "div",
              {
                className: "ui-sidebar-resize",
                style: { right: -2 },
                onMouseDown: () => resizingLeft.current = true
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { ref: viewportRef, style: {
            flex: 1,
            position: "relative",
            backgroundColor: theme.canvasBg,
            overflow: "hidden"
          }, children: [
            /* @__PURE__ */ jsx("canvas", { ref: canvasRef, style: { width: "100%", height: "100%", outline: "none" } }),
            /* @__PURE__ */ jsx(ViewCube, { sceneMgr: mgrInstance, theme, lang }),
            contextMenu.visible && /* @__PURE__ */ jsx(
              ContextMenu,
              {
                x: contextMenu.x,
                y: contextMenu.y,
                items: [
                  {
                    label: t("hide_selected") || "隐藏选中",
                    onClick: handleHideSelected,
                    disabled: selectedUuids.length === 0
                  },
                  {
                    label: t("isolate_selection") || "隔离选中",
                    onClick: () => {
                      if (selectedUuids.length > 0 && sceneMgr.current) {
                        const newIsolated = selectedUuids.filter((id) => !isolatedUuids.has(id));
                        if (newIsolated.length > 0) {
                          sceneMgr.current.isolateObjects(selectedUuids);
                          setIsolatedUuids(/* @__PURE__ */ new Set([...isolatedUuids, ...newIsolated]));
                        }
                      }
                    },
                    disabled: selectedUuids.length === 0
                  },
                  {
                    label: t("clear_selection") || "清空选择",
                    onClick: handleClearSelection,
                    disabled: selectedUuids.length === 0
                  },
                  {
                    label: t("show_all") || "显示全部",
                    onClick: handleShowAll
                  }
                ],
                onClose: () => setContextMenu((prev) => ({ ...prev, visible: false })),
                theme
              }
            ),
            toast && /* @__PURE__ */ jsxs("div", { className: "ui-toast", children: [
              /* @__PURE__ */ jsx("div", { className: "ui-toast-dot", style: {
                backgroundColor: toast.type === "error" ? "var(--error)" : toast.type === "success" ? "var(--success)" : "var(--info)"
              } }),
              /* @__PURE__ */ jsx("span", { style: { fontWeight: 500 }, children: toast.message }),
              /* @__PURE__ */ jsx(
                "button",
                {
                  className: "ui-toast-close",
                  onClick: () => setToast(null),
                  children: /* @__PURE__ */ jsx(IconClose, { size: 12 })
                }
              )
            ] }),
            /* @__PURE__ */ jsx(LoadingOverlay, { t, loading, status, progress, theme }),
            activeTool === "measure" && /* @__PURE__ */ jsx(
              MeasurePanel,
              {
                t,
                sceneMgr: sceneMgr.current,
                measureType,
                setMeasureType,
                measureHistory,
                highlightedId: highlightedMeasureId,
                onHighlight: (id) => {
                  setHighlightedMeasureId(id);
                  sceneMgr.current?.highlightMeasurement(id);
                  if (id) sceneMgr.current?.locateMeasurement(id);
                },
                onDelete: (id) => {
                  sceneMgr.current?.removeMeasurement(id);
                  setMeasureHistory((prev) => prev.filter((i) => i.id !== id));
                  if (highlightedMeasureId === id) {
                    setHighlightedMeasureId(null);
                    sceneMgr.current?.highlightMeasurement(null);
                  }
                },
                onClear: () => {
                  sceneMgr.current?.clearAllMeasurements();
                  setMeasureHistory([]);
                  setHighlightedMeasureId(null);
                  setMeasureType("none");
                },
                onClose: () => setActiveTool("none"),
                theme
              }
            ),
            activeTool === "clip" && /* @__PURE__ */ jsx(
              ClipPanel,
              {
                t,
                sceneMgr: sceneMgr.current,
                onClose: () => setActiveTool("none"),
                clipEnabled,
                setClipEnabled,
                clipValues,
                setClipValues,
                clipActive,
                setClipActive,
                theme
              }
            ),
            activeTool === "export" && /* @__PURE__ */ jsx(ExportPanel, { t, onClose: () => setActiveTool("none"), onExport: handleExport, theme }),
            activeTool === "settings" && /* @__PURE__ */ jsx(
              SettingsPanel,
              {
                t,
                onClose: () => setActiveTool("none"),
                settings: sceneSettings,
                onUpdate: handleSettingsUpdate,
                currentLang: lang,
                setLang,
                themeMode,
                setThemeMode: handleThemeModeChange,
                showStats,
                setShowStats,
                theme
              }
            ),
            activeTool === "viewpoint" && /* @__PURE__ */ jsx(
              ViewpointPanel,
              {
                t,
                viewpoints,
                onSave: handleSaveViewpoint,
                onUpdateName: handleUpdateViewpointName,
                onLoad: handleLoadViewpoint,
                onDelete: handleDeleteViewpoint,
                onClose: () => setActiveTool("none"),
                theme
              }
            ),
            activeTool === "sun" && /* @__PURE__ */ jsx(
              SunPanel,
              {
                t,
                settings: sceneSettings,
                onUpdate: handleSettingsUpdate,
                onClose: () => setActiveTool("none"),
                theme
              }
            )
          ] }),
          showProps && /* @__PURE__ */ jsxs("div", { style: {
            width: `${rightWidth}px`,
            backgroundColor: theme.panelBg,
            borderLeft: `1px solid ${theme.border}`,
            display: "flex",
            flexDirection: "column",
            zIndex: 10,
            position: "relative"
          }, children: [
            /* @__PURE__ */ jsxs("div", { className: "ui-sidebar-header", children: [
              /* @__PURE__ */ jsx("span", { children: t("interface_props") }),
              /* @__PURE__ */ jsx(
                "div",
                {
                  onClick: () => setShowProps(false),
                  style: { cursor: "pointer", opacity: 0.6, display: "flex", padding: 2, borderRadius: "50%" },
                  onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
                  onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
                  children: /* @__PURE__ */ jsx(IconClose, { width: 16, height: 16 })
                }
              )
            ] }),
            /* @__PURE__ */ jsx("div", { style: { flex: 1, overflow: "hidden" }, children: /* @__PURE__ */ jsx(PropertiesPanel, { t, selectedProps, theme }) }),
            /* @__PURE__ */ jsx(
              "div",
              {
                onMouseDown: () => resizingRight.current = true,
                style: {
                  position: "absolute",
                  left: -2,
                  top: 0,
                  bottom: 0,
                  width: 4,
                  cursor: "col-resize",
                  zIndex: 20
                }
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { style: {
          height: "24px",
          backgroundColor: theme.bg,
          color: theme.text,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          fontSize: "11px",
          zIndex: 1e3,
          justifyContent: "space-between",
          borderTop: `1px solid ${theme.border}`
        }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "16px" }, children: [
            /* @__PURE__ */ jsx("span", { children: status }),
            loading && /* @__PURE__ */ jsxs("span", { children: [
              progress,
              "%"
            ] }),
            selectedUuid && selectedUuids.length > 1 && /* @__PURE__ */ jsxs("span", { style: { opacity: 0.8, paddingLeft: "8px", borderLeft: `1px solid ${theme.border}` }, children: [
              t("selected_count") || "已选择",
              ": ",
              selectedUuids.length
            ] }),
            chunkProgress.total > 0 && chunkProgress.loaded < chunkProgress.total && /* @__PURE__ */ jsxs("div", { className: "ui-chunk-progress", children: [
              /* @__PURE__ */ jsxs("span", { children: [
                t("chunk_loading") || "分片加载",
                ": ",
                chunkProgress.loaded,
                "/",
                chunkProgress.total
              ] }),
              /* @__PURE__ */ jsx("div", { className: "ui-progress-bar", style: { width: "80px" }, children: /* @__PURE__ */ jsx(
                "div",
                {
                  className: "ui-progress-fill",
                  style: { width: `${chunkProgress.loaded / chunkProgress.total * 100}%` }
                }
              ) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "12px", alignItems: "center" }, children: [
            mousePos && /* @__PURE__ */ jsxs("div", { style: { opacity: 0.85 }, children: [
              mousePos.x.toFixed(2),
              ", ",
              mousePos.y.toFixed(2),
              ", ",
              mousePos.z.toFixed(2)
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "10px", opacity: 0.85 }, children: [
              /* @__PURE__ */ jsx("span", { children: t("tips_rotate") }),
              /* @__PURE__ */ jsx("span", { children: t("tips_pan") }),
              /* @__PURE__ */ jsx("span", { children: t("tips_zoom") })
            ] }),
            showStats && /* @__PURE__ */ jsxs("div", { style: {
              display: "flex",
              gap: "12px",
              alignItems: "center",
              paddingLeft: "12px",
              borderLeft: `1px solid ${theme.border}`
            }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "4px", opacity: 0.85 }, title: "Original Meshes", children: [
                /* @__PURE__ */ jsx(IconBox, { width: 14, height: 14 }),
                /* @__PURE__ */ jsx("span", { children: formatNumber(stats.meshes) })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "4px", opacity: 0.85 }, title: "Triangles", children: [
                /* @__PURE__ */ jsx(IconGrid, { width: 14, height: 14 }),
                /* @__PURE__ */ jsx("span", { children: formatNumber(stats.faces) })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: "4px", opacity: 0.85 }, children: [
                /* @__PURE__ */ jsx(IconActivity, { width: 14, height: 14 }),
                /* @__PURE__ */ jsx("span", { children: formatMemory(stats.memory) })
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { opacity: 0.75, fontVariantNumeric: "tabular-nums" }, title: "FPS", children: [
                stats.fps,
                " FPS"
              ] }),
              stats.chunksTotal > 0 && /* @__PURE__ */ jsxs("div", { style: { opacity: 0.75, fontVariantNumeric: "tabular-nums" }, title: "Chunks", children: [
                "CH ",
                stats.chunksLoaded,
                "/",
                stats.chunksTotal
              ] }),
              /* @__PURE__ */ jsxs("div", { style: { opacity: 0.75, fontVariantNumeric: "tabular-nums" }, title: "Pixel Ratio", children: [
                "DPR ",
                stats.pixelRatio
              ] })
            ] }),
            /* @__PURE__ */ jsx(
              "div",
              {
                onClick: () => handleThemeModeChange(themeMode === "dark" ? "light" : "dark"),
                style: {
                  cursor: "pointer",
                  padding: "4px",
                  borderRadius: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background-color 0.2s"
                },
                onMouseEnter: (e) => e.currentTarget.style.backgroundColor = theme.itemHover,
                onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
                title: themeMode === "dark" ? t("theme_light") : t("theme_dark"),
                children: themeMode === "dark" ? /* @__PURE__ */ jsx(IconSun, { width: 16, height: 16 }) : /* @__PURE__ */ jsx(IconMoon, { width: 16, height: 16 })
              }
            ),
            /* @__PURE__ */ jsx(
              "div",
              {
                onClick: () => setLang(lang === "zh" ? "en" : "zh"),
                style: {
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: theme.itemHover
                },
                children: lang === "zh" ? "EN" : "中文"
              }
            ),
            /* @__PURE__ */ jsx("div", { style: { width: "1px", height: "12px", backgroundColor: theme.border } }),
            /* @__PURE__ */ jsx("div", { style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "2px 8px",
              borderRadius: "4px",
              backgroundColor: theme.itemHover
            }, children: /* @__PURE__ */ jsx("span", { style: { fontWeight: "600", letterSpacing: "0.5px" }, children: "3D BROWSER" }) })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          ConfirmModal,
          {
            isOpen: confirmState.isOpen,
            title: confirmState.title,
            message: confirmState.message,
            onConfirm: () => {
              confirmState.action();
              setConfirmState({ ...confirmState, isOpen: false });
            },
            onCancel: () => setConfirmState({ ...confirmState, isOpen: false }),
            t,
            theme
          }
        ),
        /* @__PURE__ */ jsx(
          AboutModal,
          {
            isOpen: isAboutOpen,
            onClose: () => setIsAboutOpen(false),
            t,
            theme
          }
        ),
        errorState.isOpen && /* @__PURE__ */ jsx("div", { className: "ui-error-overlay", children: /* @__PURE__ */ jsxs("div", { className: "ui-error-content", style: { width: "450px" }, children: [
          /* @__PURE__ */ jsxs("div", { className: "ui-error-header", style: { backgroundColor: "var(--error)", color: "white" }, children: [
            /* @__PURE__ */ jsx("span", { children: errorState.title }),
            /* @__PURE__ */ jsx(
              "div",
              {
                onClick: () => setErrorState((prev) => ({ ...prev, isOpen: false })),
                style: { cursor: "pointer", display: "flex", padding: 2, borderRadius: "50%" },
                onMouseEnter: (e) => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)",
                onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "transparent",
                children: /* @__PURE__ */ jsx(IconClose, { width: 18, height: 18 })
              }
            )
          ] }),
          /* @__PURE__ */ jsxs("div", { style: { padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }, children: [
            /* @__PURE__ */ jsx("div", { style: { fontWeight: "600", fontSize: "15px", color: theme.text }, children: errorState.message }),
            /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-end", marginTop: "8px" }, children: /* @__PURE__ */ jsx(
              "button",
              {
                className: "ui-btn ui-btn-primary",
                style: { padding: "8px 24px" },
                onClick: () => setErrorState((prev) => ({ ...prev, isOpen: false })),
                children: t("confirm") || "确定"
              }
            ) })
          ] })
        ] }) })
      ]
    }
  ) });
};

export { ThreeViewer, ThreeViewer as default };
