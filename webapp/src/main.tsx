import { createRoot } from 'react-dom/client';
import AppRoutes from './Routes.tsx';
import { MathJaxContext } from 'better-react-mathjax';
import { Provider } from 'react-redux';
import { store } from './redux/store.ts';
import Loader from './components/Loader.tsx';
import { Suspense } from 'react';
import './style/index.css';
import './firebase/config';

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <MathJaxContext>
      <Suspense>
        <AppRoutes />
      </Suspense>
      <Loader />
    </MathJaxContext>
  </Provider>,
);
