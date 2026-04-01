1 ifc定位出现卡死

2 其他模型定位无效

3 点选模型列表定位应该居中，而不是刚好在底部

4 example 发布github pages 后，ifc无法加载，index-DJwo9-wz.js:4019 加载 jg.ifc 失败 RuntimeError: Aborted(both async and sync fetching of the wasm failed). Build with -sASSERTIONS for more info.    at jo (web-ifc-api-DraPdK2r.js:18:6842)    at web-ifc-api-DraPdK2r.js:18:7510

stp打开也失败，初始化 OCCT 引擎失败: Error: Failed to load /libs/occt-import-js/occt-import-js.js
    at o.onerror (OCCTLoader-CiM09x_z-BAqKodQ7.js:1:849)
load @ OCCTLoader-CiM09x_z-BAqKodQ7.js:1
index-DJwo9-wz.js:4019 加载 框架受力分析.step 失败 Error: error_cad_engine_init_failed
    at I.load (OCCTLoader-CiM09x_z-BAqKodQ7.js:1:3578)
    at async zO (index-DJwo9-wz.js:4019:12826)
    at async GO (index-DJwo9-wz.js:4019:13635)
    at async HP (index-DJwo9-wz.js:4046:12226)
    at async Kc (index-DJwo9-wz.js:4046:37380)
    at async Lr (index-DJwo9-wz.js:4046:37049)
    at async xo (index-DJwo9-wz.js:4046:37553)

5 3dtitles打开没有模型结构，没有文件名（导出需要处理）