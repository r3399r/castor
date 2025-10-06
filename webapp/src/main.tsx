import { createRoot } from 'react-dom/client';
import AppRoutes from './Routes.tsx';
import { MathJaxContext } from 'better-react-mathjax';
import './style/index.css';

createRoot(document.getElementById('root')!).render(
  <MathJaxContext>
    <AppRoutes />
  </MathJaxContext>,
);
