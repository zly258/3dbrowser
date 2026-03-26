import { ThreeViewer } from "@zhangly1403/3dbrowser";
import "./styles.css";

const demoFiles = [
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb"
];

export default function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>3DBrowser Example</h1>
        <p>独立示例项目，引用 npm 发布后的编译库。</p>
      </header>
      <section className="viewer-wrap">
        <ThreeViewer
          libPath="/libs"
          defaultTheme="light"
          defaultLang="zh"
          showStats={true}
          initialFiles={demoFiles}
          initialSettings={{
            bgType: "solid",
            bgColor: "#f2f5f9"
          }}
        />
      </section>
    </main>
  );
}
