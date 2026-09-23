import { useEffect } from 'react';
import templateHtml from './template.html?raw';
import { initApp } from './app.js';
import './styles.css';

// Extract the dashboard markup from template.html (everything inside <body>...</body> minus script tags)
const dashboardMarkup = templateHtml
  .replace(/^[\s\S]*?<body[^>]*>/i, '')
  .replace(/<\/body>[\s\S]*$/i, '')
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .trim();

export default function App() {
  useEffect(() => {
    initApp();
  }, []);

  return (
    <div
      id="dashboard-root"
      dangerouslySetInnerHTML={{ __html: dashboardMarkup }}
    />
  );
}
