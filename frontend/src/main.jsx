import React from 'react';
import ReactDOM from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App';
import './index.css';
import './styles/learning-workspaces.css';
import './styles/public-surfaces.css';
import './styles/landing-effects.css';
import './styles/not-found.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
