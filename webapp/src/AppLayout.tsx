import { Outlet } from 'react-router-dom';
import Bar from './components/Bar';

const AppLayout = () => {
  return (
    <>
      <Bar />
      <div className="mx-4 mt-4 mb-20 sm:mx-10 md:mx-auto md:w-[945px]">
        <Outlet />
      </div>
    </>
  );
};

export default AppLayout;
