
import React from 'react';
import { createRoot } from 'react-dom/client';
import './3dbrowser-lib/3dbrowser.css';
import App from './App';

const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
}
