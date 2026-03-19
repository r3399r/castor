import { lazy } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import AppLayout from './AppLayout';

// Lazy-loaded components
const Home = lazy(() => import('./pages/home'));
const Subject = lazy(() => import('./pages/subject'));
const Exam = lazy(() => import('./pages/exam'));
const QuestionList = lazy(() => import('./pages/questionList'));
const Question = lazy(() => import('./pages/question'));

const AppRoutes = () => {
  const router = createBrowserRouter([
    {
      element: <AppLayout />,
      children: [
        { path: '/subject', element: <Subject /> },
        { path: '/exam', element: <Exam /> },
        { path: '/question', element: <QuestionList /> },
        { path: '/question/:uuid', element: <Question /> },
        { path: '/', element: <Home /> },
        { path: '/*', element: <Navigate to="/" /> },
      ],
    },
  ]);

  return <RouterProvider router={router} />;
};

export default AppRoutes;
