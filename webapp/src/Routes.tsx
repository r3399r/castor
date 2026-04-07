import { lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import AppLayout from './AppLayout';

// Lazy-loaded components
const Home = lazy(() => import('./pages/home'));
const QuestionList = lazy(() => import('./pages/questionList'));
const Question = lazy(() => import('./pages/question'));
const Adaptive = lazy(() => import('./pages/adaptive'));
const User = lazy(() => import('./pages/user'));

const AppRoutes = () => {
  const router = createBrowserRouter([
    {
      element: <AppLayout />,
      children: [
        { path: '/question', element: <QuestionList /> },
        { path: '/question/:uuid', element: <Question /> },
        { path: '/adaptive', element: <Adaptive /> },
        { path: '/user', element: <User /> },
        { path: '/', element: <Home /> },
        { path: '/*', element: <Navigate to="/" /> },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
};

export default AppRoutes;
