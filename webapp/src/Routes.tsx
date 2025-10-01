import { lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import AppLayout from './AppLayout';

// Lazy-loaded components
const QuestionList = lazy(() => import('./pages/questionList'));
const Question = lazy(() => import('./pages/question'));
const User = lazy(() => import('./pages/user'));

const AppRoutes = () => {
  const router = createBrowserRouter([
    {
      element: <AppLayout />,
      children: [
        { path: '/', element: <QuestionList /> },
        { path: '/user', element: <User /> },
        { path: '/q/:id', element: <Question /> },
        { path: '/*', element: <Navigate to="/" /> },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
};

export default AppRoutes;
