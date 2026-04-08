import { lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import AppLayout from './AppLayout';

// Lazy-loaded components
const Home = lazy(() => import('./pages/home'));
const QuestionList = lazy(() => import('./pages/questionList'));
const Adaptive = lazy(() => import('./pages/adaptive'));
const User = lazy(() => import('./pages/user'));
const Reply = lazy(() => import('./pages/reply'));
const Preview = lazy(() => import('./pages/preview'));

const AppRoutes = () => {
  const router = createBrowserRouter([
    {
      element: <AppLayout />,
      children: [
        { path: '/question', element: <QuestionList /> },
        { path: '/adaptive', element: <Adaptive /> },
        { path: '/user', element: <User /> },
        { path: '/reply', element: <Reply /> },
        { path: '/preview', element: <Preview /> },
        { path: '/', element: <Home /> },
        { path: '/*', element: <Navigate to="/" /> },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
};

export default AppRoutes;
