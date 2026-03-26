
import React from 'react';
import { ThreeViewer } from '@zhangly1403/3dbrowser';

const App: React.FC = () => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100vw',
            height: '100vh',
            backgroundColor: '#f4f4f5',
            color: '#1c1c1e'
        }}>
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ThreeViewer
                    allowDragOpen={true}
                    libPath="./libs"
                    showStats={true}
                    defaultTheme="light"
                />
            </div>
        </div>
    );
};

export default App;
