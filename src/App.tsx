import { ThreeViewer } from "@zhangly1403/3dbrowser";
import "../3dbrowser-lib/3dbrowser.css";

export default function App() {
  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <ThreeViewer
        libPath="/libs"
        defaultTheme="light"
        defaultLang="zh"
        showStats={true}
      />
    </div>
  );
}
