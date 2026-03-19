
import React from 'react';
import { ThreeViewer } from '@zhangly1403/3dbrowser';

const App: React.FC = () => {

    const containerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#1e1e1e',
        color: '#fff'
    };

    return (
        <div style={containerStyle}>
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <ThreeViewer
                    allowDragOpen={true}
                    libPath="./libs"
                    showStats={true}
                    menuMode={'toolbar'}
                />
            </div>
        </div>
    );
};

export default App;
