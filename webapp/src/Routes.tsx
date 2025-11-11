import { lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import AppLayout from './AppLayout';

// Lazy-loaded components
const QuestionList = lazy(() => import('./pages/questionList'));
const Question = lazy(() => import('./pages/question'));
const User = lazy(() => import('./pages/user'));
const Category = lazy(() => import('./pages/category'));
const Preview = lazy(() => import('./pages/preview'));

const AppRoutes = () => {
  const router = createBrowserRouter([
    {
      element: <AppLayout />,
      children: [
        { path: '/list', element: <QuestionList /> },
        { path: '/user', element: <User /> },
        { path: '/category', element: <Category /> },
        { path: '/q/:id', element: <Question /> },
        { path: '/preview', element: <Preview /> },
        { path: '/*', element: <Navigate to="/list" /> },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
};

export default AppRoutes;
