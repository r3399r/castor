import { createRoot } from 'react-dom/client';
import AppRoutes from './Routes.tsx';
import './style/index.css';

createRoot(document.getElementById('root')!).render(<AppRoutes />);
